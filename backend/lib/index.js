"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const server_1 = require("./server");
async function main() {
    await (0, server_1.init)();
    await (0, server_1.start)();
}
main().catch(console.error);
