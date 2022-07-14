"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.start = exports.init = exports.server = void 0;
const Hapi = require("@hapi/hapi");
const init = async function () {
    exports.server = Hapi.server({
        port: process.env.PORT || 4000,
        host: '0.0.0.0'
    });
    // Routes will go here
    return exports.server;
};
exports.init = init;
const start = async function () {
    console.log(`Listening on ${exports.server.settings.host}:${exports.server.settings.port}`);
    return exports.server.start();
};
exports.start = start;
process.on('unhandledRejection', (err) => {
    console.error("unhandledRejection");
    console.error(err);
    process.exit(1);
});
