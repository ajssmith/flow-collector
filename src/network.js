/*
 Licensed to the Apache Software Foundation (ASF) under one
 or more contributor license agreements.  See the NOTICE file
 distributed with this work for additional information
 regarding copyright ownership.  The ASF licenses this file
 to you under the Apache License, Version 2.0 (the
 "License"); you may not use this file except in compliance
 with the License.  You may obtain a copy of the License at
   http://www.apache.org/licenses/LICENSE-2.0
 Unless required by applicable law or agreed to in writing,
 software distributed under the License is distributed on an
 "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 KIND, either express or implied.  See the License for the
 specific language governing permissions and limitations
 under the License.
*/

"use strict";

const amqp   = require('rhea');
const record = require('./record.js');
const data   = require('./data.js');

amqp.options.enable_sasl_external = true;

var connection;
var beaconReceiver;
var connectedHandlers = [];
var routers           = {};  // address => receiver
var connected         = false;

exports.Start = function() {
    console.log("[Beacon detector module starting]");
    return new Promise((resolve, reject) => {
        connection = amqp.connect();
        beaconReceiver = connection.open_receiver('mc/sfe.all');
        resolve();
    });
}


const onRouterBeacon = function(ap) {
    if (!routers[ap.address]) {
        console.log(`New router detected at address ${ap.address}`);
        routers[ap.address] = connection.open_receiver(ap.address);
    }
}


const onCollectorBeacon = function(ap) {
    console.log(`CONSOLE beacon for address: ${ap.address}`);
}


const onBeacon = function(context) {
    let ap = context.message.application_properties;
    if (ap.v == 1 && ap.sourceType == 'ROUTER') {
        onRouterBeacon(ap);
    }
    if (ap.v == 1 && ap.sourceType == 'COLLECTOR') {
        onCollectorBeacon(ap);
    }
}


amqp.on('connection_open', function(context) {
    console.log("Connection to the VAN is open");
    connected = true;
    connectedHandlers.forEach(handler => handler(context.connection));
    connectedHandlers = [];
});


amqp.on('disconnected', function(context) {
    if (connected) {
        connected = false;
        console.log("Connection to the VAN has been lost");
    }
});


amqp.on('message', function(context) {
    if (context.message.subject == 'BEACON') {
        onBeacon(context);
    } else if (context.message.subject == 'RECORD') {
        var rtype, id, rec;
        let recordList = context.message.body;
        recordList.forEach(item => {
            [rtype, id, rec] = record.FlowToRecord(item)
            data.IncomingRecord(rtype, id, rec);
        });
    }
});

