"use strict";
/*global describe, it, require*/
const async = require("async");
const should = require("should");

const opcua = require("node-opcua");
const OPCUAClient = opcua.OPCUAClient;

const sinon = require("sinon");

const perform_operation_on_subscription = require("../../test_helpers/perform_operation_on_client_session").perform_operation_on_subscription;
const { promisify, callbackify } = require("util");

async function perform_operation_on_subscription_async(
    client, endpointUrl, inner_func /*async  (session, subscription) => */) {

    let ret = undefined;

    function f(callback1) {

    perform_operation_on_subscription(client, endpointUrl, (session, subscription, callback) => {
        callbackify(inner_func)(session, subscription, (err, retValue)=> {
            ret = retValue;
            callback(err);
        });
        }, callback1);
    }
    await promisify(f)(); 

    return ret;
}

module.exports = function (test) {

    describe("SDS2 Testing SessionSecurityDiagnostics", function () {

        it("SDS2-A server should expose a ServerSecurityDiagnostic object", async () => {

            const client = opcua.OPCUAClient.create({});
            client.on("backoff",() => { console.log("keep trying to connect "+ test.endpointUrl)});
            
            await perform_operation_on_subscription_async(client, test.endpointUrl, async (session, subscription) => {

                const nodesToRead = [
                    {
                        nodeId: opcua.makeNodeId(opcua.VariableIds.Server_ServerDiagnostics_SessionsDiagnosticsSummary_SessionDiagnosticsArray),
                        attributeId: opcua.AttributeIds.Value
                    },
                    {
                        nodeId: opcua.makeNodeId(opcua.VariableIds.Server_ServerDiagnostics_SessionsDiagnosticsSummary_SessionSecurityDiagnosticsArray),
                        attributeId: opcua.AttributeIds.Value
                    },
                ];
                const dataValues = await session.read(nodesToRead);
                const sessionDiagnostics = dataValues[0].value.value;
                const sessionSecurityDiagnostics = dataValues[1].value.value;

                should.exist(sessionSecurityDiagnostics);

                console.log(sessionSecurityDiagnostics.toString());
            });
        });

        it("SDS2-B server should expose a SessionSecurityDiagnostics per Session", async () => {

            const client = opcua.OPCUAClient.create({});

            await perform_operation_on_subscription_async(client, test.endpointUrl, async (session, subscription) => {

                const nodeToRead = {
                    nodeId: session.sessionId,
                    attributeId: opcua.AttributeIds.BrowseName
                };
                const dataValue = await session.read(nodeToRead);

                const browseDesc = {
                    nodeId: session.sessionId,
                    /// referenceTypeId: ,
                    browseDirection: opcua.BrowseDirection.Forward,
                    resultMask: 63
                };
                const browseResult = await session.browse([browseDesc]);

                const browsePath = [
                    opcua.makeBrowsePath(session.sessionId, ".SessionSecurityDiagnostics.AuthenticationMechanism"),
                    opcua.makeBrowsePath(session.sessionId, ".SessionSecurityDiagnostics.ClientCertificate"),
                    opcua.makeBrowsePath(session.sessionId, ".SessionSecurityDiagnostics.ClientUserIdOfSession"),
                    opcua.makeBrowsePath(session.sessionId, ".SessionSecurityDiagnostics"),
                    opcua.makeBrowsePath(session.sessionId, ".SessionSecurityDiagnostics.SecurityMode")
                ];

                const browsePathResults = await session.translateBrowsePath(browsePath);
                browsePathResults[0].statusCode.should.eql(opcua.StatusCodes.Good);
                browsePathResults[1].statusCode.should.eql(opcua.StatusCodes.Good);
                browsePathResults[2].statusCode.should.eql(opcua.StatusCodes.Good);
                browsePathResults[3].statusCode.should.eql(opcua.StatusCodes.Good);

                const authenticationMechanismNodeId = browsePathResults[0].targets[0].targetId;
                const currentSessionSecurityDiagnosticNodeId = browsePathResults[3].targets[0].targetId;

                const nodeToRead2 = {
                    nodeId: currentSessionSecurityDiagnosticNodeId,
                    attributeId: opcua.AttributeIds.Value
                };
                const dataValue2 = await session.read(nodeToRead2);
                dataValue2.statusCode.should.eql(opcua.StatusCodes.Good);
                dataValue2.value.value.constructor.name.should.eql("SessionSecurityDiagnosticsDataType");
                
                console.log(dataValue2.value.value.toString());
                const itemsToMonitor = [
                    {
                        nodeId: currentSessionSecurityDiagnosticNodeId,
                        attributeId: opcua.AttributeIds.Value
                    },

                    {
                        nodeId: authenticationMechanismNodeId,
                        attributeId: opcua.AttributeIds.Value
                    },
                ];
                const options = {
                    samplingInterval: 10,
                    discardOldest: true,
                    queueSize: 10
                };
/*
                monitoredItemGroup = opcua.ClientMonitoredItemGroup.create(subscription,itemsToMonitor, options);

                monitoredItemGroupChangeSpy = sinon.spy();
                monitoredItemGroup.on("changed", monitoredItemGroupChangeSpy);
            */
            });
        });

        it("SDS2-C server should expose a SessionSecurityDiagnostics in SessionDiagnosticsSummary.SessionSecurityDiagnosticsArray", async () => {

            const client = opcua.OPCUAClient.create({});
            await perform_operation_on_subscription_async(client, test.endpointUrl, async (session, subscription) => {

                //xx console.log("session nodeId = ",session.sessionId);

                let sessionDiagnosticsArrayNodeId = opcua.resolveNodeId("Server_ServerDiagnostics_SessionsDiagnosticsSummary_SessionDiagnosticsArray");
                const serverNodeId =opcua.resolveNodeId("Server");
                let sessionDiagnosticsNodeId;

                const browsePath = [
                    opcua.makeBrowsePath(serverNodeId, ".ServerDiagnostics.SessionsDiagnosticsSummary.SessionDiagnosticsArray"),
                ];

                const browsePathResults = await session.translateBrowsePath(browsePath);
                browsePathResults[0].statusCode.should.eql(opcua.StatusCodes.Good);
                sessionDiagnosticsArrayNodeId = browsePathResults[0].targets[0].targetId;

                const browseDesc = {
                    nodeId: sessionDiagnosticsArrayNodeId,
                    referenceTypeId: "HasComponent",
                    browseDirection: opcua.BrowseDirection.Forward,
                    resultMask: 63
                };
                const browseResult = await session.browse([browseDesc]);
                // enumerate all sessions availables
                //xx console.log(browseResult[0].toString());
                sessionDiagnosticsNodeId = browseResult[0].references[0].nodeId;

                // read session diagnostics
                const nodeToRead = {
                    nodeId: sessionDiagnosticsNodeId,
                    attributeId: opcua.AttributeIds.Value
                };
                const dataValue = await session.read(nodeToRead);
                dataValue.statusCode.should.eql(opcua.StatusCodes.Good);
                dataValue.value.value.constructor.name.should.eql("SessionDiagnosticsDataType");
                dataValue.value.value.totalRequestCount.totalCount.should.be.greaterThan(7);
            });

        });

        async function count_number_of_exposed_sessionDiagnostics()/*: Promise<number>*/ {

            let sessionDiagnosticsArrayNodeId = opcua.resolveNodeId("Server_ServerDiagnostics_SessionsDiagnosticsSummary_SessionDiagnosticsArray");
            const serverNodeId =opcua.resolveNodeId("Server");

            let sessionDiagnosticsNodeId;
            let nbSessionDiagnostics = -1;
            const client = opcua.OPCUAClient.create({});
            return await perform_operation_on_subscription_async(client, test.endpointUrl, async (session, subscription) => {
                //  function get_sessionDiagnosticsArrayNodeId(callback) {
                const browsePath = [
                    opcua.makeBrowsePath(serverNodeId, ".ServerDiagnostics.SessionsDiagnosticsSummary.SessionSecurityDiagnosticsArray"),
                ];

                const browsePathResults = await session.translateBrowsePath(browsePath);

                //xx console.log(browsePathResults[3].toString());
                browsePathResults[0].statusCode.should.eql(opcua.StatusCodes.Good);
                sessionDiagnosticsArrayNodeId = browsePathResults[0].targets[0].targetId;

                const browseDesc = {
                    nodeId: sessionDiagnosticsArrayNodeId,
                    referenceTypeId: "HasComponent",
                    browseDirection: opcua.BrowseDirection.Forward,
                    resultMask: 63
                };
                const browseResult = await session.browse([browseDesc]);
                // enumerate all sessions availables
                //xx console.log(browseResult[0].toString());
                sessionDiagnosticsNodeId = browseResult[0].references[0].nodeId;
                nbSessionDiagnostics = browseResult[0].references.length;
                return nbSessionDiagnostics;
            });
        }


        it("SDS2-D server should remove SessionSecurityDiagnostic when session is closed",async () => {

            let nbSessionDiagnosticsStep2;

            // count_before
            let nbSessionDiagnosticsStep1 = await count_number_of_exposed_sessionDiagnostics();

            //  createSession
            const client = opcua.OPCUAClient.create({});
            await  perform_operation_on_subscription_async(client, test.endpointUrl, async (session, subscription) => {
                
                const nbSessionDiagnostic = await count_number_of_exposed_sessionDiagnostics();
                nbSessionDiagnosticsStep1.should.eql(nbSessionDiagnostic-1);

             });
        });

    });
};
