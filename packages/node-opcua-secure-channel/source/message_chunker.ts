/**
 * @module node-opcua-secure-channel
 */
// tslint:disable:max-line-length

import { assert } from "node-opcua-assert";
import * as  _ from "underscore";

import { encodeExpandedNodeId } from "node-opcua-basic-types";
import { BinaryStream } from "node-opcua-binary-stream";
import { DerivedKeys } from "node-opcua-crypto";
import { BaseUAObject } from "node-opcua-factory";
import { AsymmetricAlgorithmSecurityHeader, SymmetricAlgorithmSecurityHeader } from "node-opcua-service-secure-channel";

import {
    SecureMessageChunkManager,
    SecureMessageChunkManagerOptions,
    SecurityHeader
} from "./secure_message_chunk_manager";
import { SequenceNumberGenerator } from "./sequence_number_generator";

export interface MessageChunkerOptions {
    securityHeader?: SecurityHeader;
    derivedKeys?: DerivedKeys | null;
}

export type MessageCallbackFunc = (chunk: Buffer | null) => void;

export interface ChunkMessageOptions extends SecureMessageChunkManagerOptions {
    tokenId: number;
}

/**
 * @class MessageChunker
 * @param options {Object}
 * @param options.securityHeader  {Object} SecurityHeader
 * @param [options.derivedKeys] {Object} derivedKeys
 * @constructor
 */
export class MessageChunker {
    public securityHeader?: any;

    private readonly sequenceNumberGenerator: SequenceNumberGenerator;
    private _stream?: BinaryStream;
    private derivedKeys?: DerivedKeys | null;

    constructor(options: MessageChunkerOptions) {
        this.sequenceNumberGenerator = new SequenceNumberGenerator();
        this.update(options);
    }

    public dispose() {
        this.securityHeader = null;
        this.derivedKeys = undefined;
        this._stream = undefined;
    }

    /***
     * update security information
     */
    public update(options?: MessageChunkerOptions) {

        options = options || {};
        options.securityHeader = options.securityHeader ||
            new AsymmetricAlgorithmSecurityHeader({securityPolicyUri: "http://opcfoundation.org/UA/SecurityPolicy#None"});

        assert(_.isObject(options));
        assert(_.isObject(options.securityHeader));

        this.securityHeader = options.securityHeader;
        this.derivedKeys = options.derivedKeys || undefined;
    }

    public chunkSecureMessage(
        msgType: string,
        options: ChunkMessageOptions,
        message: BaseUAObject,
        messageChunkCallback: MessageCallbackFunc) {

        assert(_.isFunction(messageChunkCallback));

        // calculate message size ( with its  encodingDefaultBinary)
        const binSize = message.binaryStoreSize() + 4;

        const stream = new BinaryStream(binSize);
        this._stream = stream;

        encodeExpandedNodeId(message.schema.encodingDefaultBinary!, stream);
        message.encode(stream);

        let securityHeader;
        if (msgType === "OPN") {
            securityHeader = this.securityHeader;
        } else {
            securityHeader = new SymmetricAlgorithmSecurityHeader({tokenId: options.tokenId});
        }

        const chunkManager = new SecureMessageChunkManager(
            msgType, options, securityHeader, this.sequenceNumberGenerator
        );

        chunkManager
            .on("chunk", (messageChunk: Buffer) => {
                messageChunkCallback(messageChunk);
            })
            .on("finished", ()  => {
                messageChunkCallback(null);
            });

        chunkManager.write(stream.buffer, stream.buffer.length);

        chunkManager.end();
    }
}
