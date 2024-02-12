// Javascript PDP 11/70 Emulator v3.2
// written by Paul Nankervis
// Please send suggestions, fixes and feedback to paulnank@hotmail.com
//
// This code may be used freely provided the original author name is acknowledged in any modified source code
//
//
//
const
    IO_BLOCKSIZE = 1024 * 1024; // 1 Mb request size. Larger reduces number of requests but increases count

// =========== Disk I/O support routines ===========

// extractXHR() copies the XMLHttpRequest response to disk cache returning
// 0 on success or -1 on error

function extractXHR(xhr, cache, block) {
    "use strict";
    var dataView, dataLength, dataIndex, blockIndex;
    switch (xhr.status) {
        case 416: // Out of range - make empty cache block
            dataLength = 0;
            break;
        case 200: // Whole file response - fill cache from beginning
            block = 0; // Note case fall thru!
        case 0: // Local response - have to assume we got appropriate response
        case 206: // Partial response - use what is there
            dataView = new Uint8Array(xhr.response);
            dataLength = dataView.length;
            break;
        default: // Error - signal and exit
            return -1; // Return error
    }

    dataIndex = 0; // Start copy to cache at the beginning
    do {
        if (typeof cache[block] === "undefined") {
            cache[block] = new Uint8Array(IO_BLOCKSIZE); // Creates zero filled cache block
            for (blockIndex = 0; blockIndex < IO_BLOCKSIZE && dataIndex < dataLength;) {
                cache[block][blockIndex++] = dataView[dataIndex++] & 0xff;
            }
        } else {
            dataIndex += IO_BLOCKSIZE; // Skip any existing cache blocks
        }
        block++;
    } while (dataIndex < dataLength);

    return 0; // Return success
}

// getData() is called at the completion of an XMLHttpRequest request to GET disk data.
// It extracts the received data and stores it in the appropriate disk cache, then resumes
// the pending IO (which may trigger more transfers).

function getData(xhr, operation, meta, position, address, count) {
    "use strict";
    if (extractXHR(xhr, meta.cache, ~~(position / IO_BLOCKSIZE)) < 0) {
        meta.postProcess(1, meta, position, address, count); // NXD - invoke error callback
    } else {
        diskIO(operation, meta, position, address, count); // Resume I/O
    }
}

// diskIO() moves data between memory and the disk cache. If cache blocks are undefined then
// an XMLHttpRequest request is kicked off to get the appropriate disk data from the server.
// Operations supported are:  1: Write, 2: Read, 3: Check (corresponds with RK function codes :-) )
// all units are in bytes (an allowance for tape which can do byte IO)

function diskIO(operation, meta, position, address, count) {
    "use strict";
    var block, offset, data;
    block = ~~(position / IO_BLOCKSIZE); // Disk cache block
    if (typeof meta.cache[block] !== "undefined") {
        offset = position % IO_BLOCKSIZE;
        while (count > 0) {
            switch (operation) {
                case 1: // Write: write from memory to cache
                case 3: // Check: compare memory with disk cache
                    data = readWordByPhysical((meta.mapped ? mapUnibus(address) : address));
                    if (data < 0) {
                        meta.postProcess(2, meta, block * IO_BLOCKSIZE + offset, address, count); // NXM
                        return;
                    }
                    if (operation === 1) { // write: put data into disk cache
                        meta.cache[block][offset] = data & 0xff;
                        meta.cache[block][offset + 1] = (data >>> 8) & 0xff;
                    } else { // check: compare memory with disk cache
                        if (data !== ((meta.cache[block][offset + 1] << 8) | meta.cache[block][offset])) {
                            meta.postProcess(3, meta, block * IO_BLOCKSIZE + offset, address, count); // mismatch
                            return;
                        }
                    }
                    //if (meta.increment) {
                    address += 2;
                    //}
                    count -= 2; // bytes to go.... (currently all write operations are whole offsets)
                    offset += 2;
                    break;
                case 2: // Read: read to memory from cache
                    data = (meta.cache[block][offset + 1] << 8) | meta.cache[block][offset];
                    if (count > 1) { // tape can read odd number of bytes - of course it can. :-(
                        if (writeWordByPhysical((meta.mapped ? mapUnibus(address) : address), data) < 0) {
                            meta.postProcess(2, meta, block * IO_BLOCKSIZE + offset, address, count); // NXM
                            return;
                        }
                        //if (meta.increment) {
                        address += 2;
                        //}
                        count -= 2; // bytes to go....
                    } else {
                        if (writeByteByPhysical((meta.mapped ? mapUnibus(address) : address), data & 0xff) < 0) {
                            meta.postProcess(2, meta, block * IO_BLOCKSIZE + offset, address, count); // NXM
                            return;
                        }
                        //if (meta.increment) {
                        address += 1;
                        //}
                        --count; // bytes to go....
                    }
                    offset += 2;
                    break;
                case 4: // accumulate a record count into the address field for tape operations
                    data = (meta.cache[block][offset + 1] << 8) | meta.cache[block][offset];
                    address = (data << 16) | (address >>> 16);
                    count -= 2; // bytes to go....
                    offset += 2;
                    break;
                case 5: // read one lousy byte (for PTR) - result also into address field!!!!
                    address = meta.cache[block][offset++];
                    count = 0; // force end!
                    break;
                default:
                    panic(); // invalid operation - how did we get here?
            }
            if (offset >= IO_BLOCKSIZE) {
                offset = 0;
                block++;
                if (typeof meta.cache[block] === "undefined") break;
            }
        }
        position = block * IO_BLOCKSIZE + offset;
    }
    if (count > 0) { // I/O not complete so we need to get some data
        if (typeof meta.xhr === "undefined") {
            meta.xhr = new XMLHttpRequest();
        }
        meta.xhr.open("GET", meta.url, true);
        meta.xhr.responseType = "arraybuffer";
        meta.xhr.onreadystatechange = function() {
            if (meta.xhr.readyState === meta.xhr.DONE) {
                getData(meta.xhr, operation, meta, position, address, count);
            }
        };
        block = ~~(position / IO_BLOCKSIZE);
        meta.xhr.setRequestHeader("Range", "bytes=" + (block * IO_BLOCKSIZE) + "-" + ((block + 1) * IO_BLOCKSIZE - 1));
        meta.xhr.send(null);
        return;
    }
    meta.postProcess(0, meta, position, address, count); // success
}



// =========== RK11 routines ===========

var rk11 = {
    rkds: 0o4700, // 017777400 Drive Status
    rker: 0, // 017777402 Error Register
    rkcs: 0o200, // 017777404 Control Status
    rkwc: 0, // 017777406 Word Count
    rkba: 0, // 017777410 Bus Address
    rkda: 0, // 017777412 Disk Address
    meta: [],
    TRACKS: [406, 406, 406, 406, 406, 406, 406, 0],
    SECTORS: [12, 12, 12, 12, 12, 12, 12, 12]
};

function rk11_init() {
    rk11.rkds = 0o4700; // Set bits 6, 7, 8, 11
    rk11.rker = 0; //
    rk11.rkcs = 0o200;
    rk11.rkwc = 0;
    rk11.rkba = 0;
    rk11.rkda = 0;
}

function rk11_seekEnd(drive) {
    //if (!(rk11.rkcs & 0x80)) { // If controller busy then requeue this request until later...
    //    interrupt(64, 5 << 5, 0o220, 0, rk11_seekEnd, drive);
    //    return 0; // Kill current interrupt
    //}
    rk11.rkds = (drive << 13) | (rk11.rkds & 0x1ff0); // Insert drive number into status
    rk11.rkcs |= 0x2000; // Set read/write/search complete
    return rk11.rkcs & 0x40; // Return IE enabled (or not)
}

function rk11_commandEnd(drive) {
    rk11.rkds = (drive << 13) | (rk11.rkds & 0x1ff0);
    rk11.rkcs |= 0x80; // Set done
    return rk11.rkcs & 0x40; // Return IE
}

function rk11_end(err, meta, position, address, count) {
    rk11.rkba = address & 0xffff;
    rk11.rkcs = (rk11.rkcs & ~0x30) | ((address >>> 12) & 0x30);
    rk11.rkcs |= 0x2000; // Set read/write/search complete
    rk11.rkwc = (0x10000 - (count >>> 1)) & 0xffff;
    position = ~~(position / 512);
    rk11.rkda = (rk11.rkda & 0xe000) | ((~~(position / rk11.SECTORS[meta.drive])) << 4) | (position % rk11.SECTORS[meta.drive]);
    switch (err) {
        case 1: // read error
            rk11.rker |= 0x8100; // Report TE (Timing error)
            rk11.rkcs |= 0xc000;
            if (rk11.rker & 0x7fc0) rk11.rkcs |= 0x4000;
            break;
        case 2: // NXM
            rk11.rker |= 0x8400; // NXM
            rk11.rkcs |= 0xc000;
            break;
        case 3: // compare error
            rk11.rker |= 0x8001; // Report TE (Write check error)
            rk11.rkcs |= 0x8000;
            break;
    }
    interrupt(10, 5 << 5, 0o220, 0, rk11_commandEnd, meta.drive); // queue command end
}

function rk11_go() {
    var sector, address, count;
    var drive = (rk11.rkda >>> 13) & 7;
    if (typeof rk11.meta[drive] === "undefined") {
        rk11.meta[drive] = {
            "cache": [],
            "postProcess": rk11_end,
            "drive": drive,
            "mapped": 1,
            "maxblock": rk11.TRACKS[drive] * rk11.SECTORS[drive],
            "url": "rk" + drive + ".dsk"
        };
    }
    if (rk11.TRACKS[drive] === 0) {
        rk11.rker |= 0x8080; // NXD
    } else {
        //console.log("RK11 function " + ((rk11.rkcs >>> 1) & 7)+" for "+drive+" e:"+rk11.rker.toString(8));
        switch ((rk11.rkcs >>> 1) & 7) { // function code
            case 0: // controller reset
                interrupt(-1, 5 << 5, 0o220, -1); // clear any pending interrupts (-1 -> no interrupt queued)
                for (var i = 0; i < 8; i++) {
                    if (typeof rk11.meta[drive] !== "undefined") {
                        if (typeof rk11.meta[drive].xhr !== "undefined") {
                            rk11.meta[drive].xhr.abort();
                        }
                    }
                }
                rk11_init();
                break;
            case 1: // write
            case 2: // read
            case 3: // check
                if (((rk11.rkda >>> 4) & 0x1ff) >= rk11.TRACKS[drive]) {
                    rk11.rker |= 0x8040; // NXC
                    break;
                }
                if ((rk11.rkda & 0xf) >= rk11.SECTORS[drive]) {
                    rk11.rker |= 0x8020; // NXS
                    break;
                }
                rk11.rkcs &= ~0x2000; // Clear search complete - reset by rk11_end
                sector = (((rk11.rkda >>> 4) & 0x1ff) * rk11.SECTORS[drive] + (rk11.rkda & 0xf));
                address = ((rk11.rkcs & 0x30) << 12) | rk11.rkba;
                count = (0x10000 - rk11.rkwc) & 0xffff;
                diskIO((rk11.rkcs >>> 1) & 7, rk11.meta[drive], sector * 512, address, count << 1);
                return;
            case 6: // Drive Reset - falls through to be finished as a seek
                rk11.rker = 0; //
                rk11.rkda &= 0xe000; // keep drive number
            case 4: // Seek (and drive reset) - complete immediately
                rk11.rkcs &= ~0x2000; // Clear search complete - reset by rk11_seekEnd
                rk11.rkcs |= 0x80; // set done - ready to accept new command
                interrupt(64, 5 << 5, 0o220, 64 + drive, rk11_seekEnd, drive); // seperate unit # to command interrupts
                break;
            case 5: // Read Check
                break;
            case 7: // Write Lock - not implemented :-(
                break;
            default:
                break;
        }
    }
    interrupt(10, 5 << 5, 0o220, 0, rk11_commandEnd, drive); // command end
    return 0; // If called by interrupt callback then result is to delete without further processing
}


function accessRK11(physicalAddress, data, byteFlag) {
    var result;
    switch (physicalAddress & ~1) {
        case 0o17777400: // rk11.rkds
            result = rk11.rkds;
            break;
        case 0o17777402: // rk11.rker
            result = rk11.rker;
            break;
        case 0o17777404: // rk11.rkcs
            result = insertData(rk11.rkcs, physicalAddress, data, byteFlag);
            if (data >= 0 && result >= 0) { // writing rkcs?
                if ((rk11.rkcs ^ result) & 0x40) { // Has IE bit changed?
                    if ((result & 0x40)) { // If IE bit now set then interrupt
                        //                      interrupt(0, 5 << 5, 0o220, 0); //  Interrupt!
                    }
                }
                rk11.rkcs = (result & ~0xf080) | (rk11.rkcs & 0xf080); // Bits 7 and 12 - 15 are read only
                if ((rk11.rkcs & 0x81) === 0x81) { // If done & go are both set then kick off new work...
                    rk11.rkcs &= ~0x81; // Turn off done & go bits (done is RO and go is WO)
                    rk11.rker &= ~0x03; // Turn off soft errors
                    //interrupt(20, 0, 220, 0, rk11_go, 0); // Wait DOS 10 can't handle instant I/O
                    setTimeout(rk11_go, 0); // Alternate approach
                }
            }
            break;
        case 0o17777406: // rk11.rkwc
            result = insertData(rk11.rkwc, physicalAddress, data, byteFlag);
            if (result >= 0) rk11.rkwc = result;
            break;
        case 0o17777410: // rk11.rkba
            result = insertData(rk11.rkba, physicalAddress, data, byteFlag);
            if (result >= 0) rk11.rkba = result;
            break;
        case 0o17777412: // rk11.rkda
            result = insertData(rk11.rkda, physicalAddress, data, byteFlag);
            if (result >= 0) rk11.rkda = result;
            break;
        case 0o17777414: // rk11.unused
        case 0o17777416: // rk11.rkdb
            result = 0;
            break;
        default:
            return trap(0o4, 0x10); // Trap 4 - 0x10 Unibus time-out
    }
    //console.log("RK11 " + physicalAddress.toString(8) + " " + byteFlag + " " + data.toString(8) + " => " + result.toString(8) + " @" + CPU.registerVal[7].toString(8));
    return result;
}


// =========== RL11 routines ===========

var rl11 = {
    csr: 0x81, // 017774400 Control status register
    bar: 0, // 017774402 Bus address
    dar: 0, // 017774404 Disk address
    mpr: 0, // 017774406 Multi purpose
    DAR: 0, // internal disk address
    meta: [], // sector cache
    SECTORS: [40, 40, 40, 40], // sectors per track
    TRACKS: [1024, 1024, 512, 512], // First two drives RL02 - last two RL01 - cylinders * 2
    STATUS: [0o235, 0o235, 0o35, 0o35] // First two drives RL02 - last two RL01
};

function rl11_commandEnd() {
    rl11.csr |= 0x81; // turn off go & set ready
    return rl11.csr & 0x40;
}

function rl11_finish(drive) {
    if (rl11.csr & 0x40) {
        interrupt(10, 5 << 5, 0o160, rl11_commandEnd, 0);
    } else { // if interrupt not enabled just mark completed
        rl11_commandEnd();
    }
}

function rl11_go() {
    var sector, address, count;
    var drive = (rl11.csr >>> 8) & 3;
    rl11.csr &= ~0x1; // ready bit (0!)
    if (typeof rl11.meta[drive] === "undefined") {
        rl11.meta[drive] = {
            "cache": [],
            "postProcess": rl11_end,
            "drive": drive,
            "mapped": 1,
            "maxblock": rl11.TRACKS[drive] * rl11.SECTORS[drive],
            "url": "rl" + drive + ".dsk"
        };
    }
    switch ((rl11.csr >>> 1) & 7) { // function code
        case 0: // no op
            break;
        case 1: // write check
            break;
        case 2: // get status
            if (rl11.mpr & 8) rl11.csr &= 0x3f;
            rl11.mpr = rl11.STATUS[drive] | (rl11.DAR & 0o100); // bit 6 Head Select bit 7 Drive Type 1=rl02
            break;
        case 3: // seek
            if ((rl11.dar & 3) === 1) {
                if (rl11.dar & 4) {
                    rl11.DAR = ((rl11.DAR + (rl11.dar & 0xff80)) & 0xff80) | ((rl11.dar << 2) & 0x40);
                } else {
                    rl11.DAR = ((rl11.DAR - (rl11.dar & 0xff80)) & 0xff80) | ((rl11.dar << 2) & 0x40);
                }
                rl11.dar = rl11.DAR;
            }
            break;
        case 4: // read header
            rl11.mpr = rl11.DAR;
            break;
        case 5: // write
            if ((rl11.dar >>> 6) >= rl11.TRACKS[drive]) {
                rl11.csr |= 0x9400; // HNF
                break;
            }
            if ((rl11.dar & 0x3f) >= rl11.SECTORS[drive]) {
                rl11.csr |= 0x9400; // HNF
                break;
            }
            sector = ((rl11.dar >>> 6) * rl11.SECTORS[drive]) + (rl11.dar & 0x3f);
            address = rl11.bar | ((rl11.csr & 0x30) << 12);
            count = (0x10000 - rl11.mpr) & 0xffff;
            diskIO(1, rl11.meta[drive], sector * 256, address, count << 1);
            return;
            break;
        case 6: // read
        case 7: // Read data without header check
            if ((rl11.dar >>> 6) >= rl11.TRACKS[drive]) {
                rl11.csr |= 0x9400; // HNF
                break;
            }
            if ((rl11.dar & 0x3f) >= rl11.SECTORS[drive]) {
                rl11.csr |= 0x9400; // HNF
                break;
            }
            sector = ((rl11.dar >>> 6) * rl11.SECTORS[drive]) + (rl11.dar & 0x3f);
            address = rl11.bar | ((rl11.csr & 0x30) << 12);
            count = (0x10000 - rl11.mpr) & 0xffff;
            diskIO(2, rl11.meta[drive], sector * 256, address, count << 1);
            return;
            break;
    }
    rl11_finish();
    //setTimeout(rl11_finish,0);
}


function rl11_end(err, meta, position, address, count) {
    var sector = ~~(position / 256);
    rl11.bar = address & 0xffff;
    rl11.csr = (rl11.csr & ~0x30) | ((address >>> 12) & 0x30);
    rl11.dar = ((~~(sector / rl11.SECTORS[meta.drive])) << 6) | (sector % rl11.SECTORS[meta.drive]);
    rl11.DAR = rl11.dar;
    rl11.mpr = (0x10000 - (count >>> 1)) & 0xffff;
    switch (err) {
        case 1: // read error
            rl11.csr |= 0x8400; // Report operation incomplete
            break;
        case 2: // NXM
            rl11.csr |= 0xa000; // NXM
            break;
    }
    rl11_finish();
}

function accessRL11(physicalAddress, data, byteFlag) {
    var result;
    switch (physicalAddress & ~1) {
        case 0o17774400: // rl11.csr
            result = insertData(rl11.csr, physicalAddress, data, byteFlag);
            if (data >= 0 && result >= 0) {
                if ((rl11.csr & 0x40) && !(result & 0x40)) { // if IE being reset then kill any pending interrupts
                    //rl11.csr |= 0x81; // turn off go & set ready
                    interrupt(-1, 5 << 5, 0o160, 0);
                }
                if (!(result & 0x80)) {
                    rl11.csr = (rl11.csr & ~0x3fe) | (result & 0x3fe);
                    rl11_go();
                } else {
                    if ((result & 0x40) && !(rl11.csr & 0x40)) {
                        interrupt(10, 5 << 5, 0o160, 0);
                    }
                    rl11.csr = (rl11.csr & ~0x3fe) | (result & 0x3fe);
                }
            }
            break;
        case 0o17774402: // rl11.bar
            result = insertData(rl11.bar, physicalAddress, data, byteFlag);
            if (result >= 0) {
                rl11.bar = result & 0xfffe;
            }
            break;
        case 0o17774404: // rl11.dar
            result = insertData(rl11.dar, physicalAddress, data, byteFlag);
            if (result >= 0) rl11.dar = result;
            break;
        case 0o17774406: // rl11.mpr
            result = insertData(rl11.mpr, physicalAddress, data, byteFlag);
            if (result >= 0) rl11.mpr = result;
            break;
        default:
            return trap(0o4, 0x10); // Trap 4 - 0x10 Unibus time-out
    }
    //console.log("RL11 " + physicalAddress.toString(8) + " " + byteFlag + " " + data.toString(8) + " => " + result.toString(8) + " @" + CPU.registerVal[7].toString(8));
    return result;
}


// =========== RP11 routines ===========

var rp11 = {
    DTYPE: [0o20022, 0o20022, 0o20020, 0o20020, 0o20020, 0o20020, 0o20022, 0o20042], // Drive type rp06, rp06, rp04, rp04...
    SECTORS: [22, 22, 22, 22, 22, 22, 22, 50], // sectors per track
    SURFACES: [19, 19, 19, 19, 19, 19, 19, 32], //
    CYLINDERS: [815, 815, 815, 815, 815, 411, 815, 630],
    meta: [], //meta data for drive
    rpcs1: 0x880, // Massbus 00 - actual register is a mix of controller and drive bits :-(
    rpwc: 0,
    rpba: 0, // rpba & rpbae
    rpda: [0, 0, 0, 0, 0, 0, 0, 0], // Massbus 05
    rpcs2: 0,
    rpds: [0x1180, 0x1180, 0x1180, 0x1180, 0x1180, 0, 0, 0], // Massbus 01 Read only
    rper1: [0, 0, 0, 0, 0, 0, 0, 0], // Massbus 0o2
    // rpas: 0, // Massbus 04???
    rpla: [0, 0, 0, 0, 0, 0, 0, 0], // Massbus 07 Read only
    rpdb: 0,
    rpmr: [0, 0, 0, 0, 0, 0, 0, 0], // Massbus 03
    rpdt: [0, 0, 0, 0, 0, 0, 0, 0], // Massbus 06 Read only
    rpsn: [1, 2, 3, 4, 5, 6, 7, 8], // Massbus 10 Read only
    rpof: [0, 0, 0, 0, 0, 0, 0, 0], // Massbus 11
    rpdc: [0, 0, 0, 0, 0, 0, 0, 0], // Massbus 12
    rpcc: [0, 0, 0, 0, 0, 0, 0, 0], // Massbus 13 Read only
    rper2: [0, 0, 0, 0, 0, 0, 0, 0], // Massbus 14
    rper3: [0, 0, 0, 0, 0, 0, 0, 0], // Massbus 15
    rpec1: [0, 0, 0, 0, 0, 0, 0, 0], // Massbus 16 Read only
    rpec2: [0, 0, 0, 0, 0, 0, 0, 0], // Massbus 17 Read only
    rpcs3: 0
};


function rp11_init() {
    rp11.rpcs1 = 0x880;
    rp11.rpcs2 = 0;
    rp11.rpds = [0x11c0, 0x11c0, 0x11c0, 0x11c0, 0x11c0, 0, 0, 0];
    rp11.rpda = [0, 0, 0, 0, 0, 0, 0, 0];
    rp11.rpdc = [0, 0, 0, 0, 0, 0, 0, 0];
    rp11.rper1 = [0, 0, 0, 0, 0, 0, 0, 0];
    rp11.rper3 = [0, 0, 0, 0, 0, 0, 0, 0];
    rp11.rpas = rp11.rpwc = rp11.rpcs3 = 0;
    rp11.rpba = 0;
}


//When a Data Transfer command is successfully initiated both RDY
//and DRY become negated. When a non-data transfer command is
//successfully initiated only DRY bit become negated.
//DVA should be set

function rp11_go() {
    var sector, drive = rp11.rpcs2 & 7;
    rp11.rpds[drive] &= 0x7fff; // turn off ATA on go bit
    if (typeof rp11.meta[drive] === "undefined") {
        rp11.meta[drive] = {
            "cache": [],
            "postProcess": rp11_end,
            "drive": drive,
            "mapped": 0,
            "maxblock": rp11.CYLINDERS[drive] * rp11.SURFACES[drive] * rp11.SECTORS[drive],
            "url": "rp" + drive + ".dsk"
        };
    }
    switch (rp11.rpcs1 & 0x3f) { // function code
        case 0o1: // NULL
            return;
        case 0o3: // unload
            break;
        case 0o5: // seek
            break;
        case 0o7: // recalibrate
            break;
        case 0o11: // init
            rp11.rpds[drive] = 0x11c0; //| 0x8000;
            rp11.rpcs1 &= ~0x703f; // Turn off error bits
            rp11.rpda[drive] = 0;
            rp11.rpdc[drive] = 0;
            rp11.rpcs1 = 0x880; // ??
            return;
        case 0o13: // release
            return;
        case 0o15: // offset
            break;
        case 0o17: // return to centreline
            break;
        case 0o21: // read in preset
            // Read-in Preset - Sets the VV (volume valid) bit, clears the Desired Sector/Track Address register, clears the Desired Cylinder Address register, and clears the FMT, HCI, and ECI bits in the Offset register. Clearing the FMT bit causes the RP04 to be in IS-bit mode.
            rp11.rpdc[drive] = rp11.rpda[drive] = 0;
            rp11.rpds[drive] = 0x11c0; // |= 0x40; // set VV
            rp11.rpof[drive] = 0; // Turn off FMT 0x1000
            return;
        case 0o23: // pack ack
            rp11.rpds[drive] |= 0x40; // set VV
            return;
        case 0o31: // search
            break;
        case 0o61: // write
            if (rp11.rpdc[drive] >= rp11.CYLINDERS[drive] || (rp11.rpda[drive] >>> 8) >= rp11.SURFACES[drive] ||
                (rp11.rpda[drive] & 0xff) >= rp11.SECTORS[drive]) {
                rp11.rper1[drive] |= 0x400; // invalid sector address
                rp11.rpcs1 |= 0xc000; // set SC & TRE
                break;
            }
            rp11.rpcs1 &= ~0x7000; // Turn error bits
            rp11.rpcs1 &= ~0x4080; // Turn TRE & ready off
            rp11.rpcs2 &= ~0x800; // Turn off NEM (NXM)
            rp11.rpds[drive] &= ~0x480; // Turn off LST & DRY
            sector = (rp11.rpdc[drive] * rp11.SURFACES[drive] + (rp11.rpda[drive] >>> 8)) * rp11.SECTORS[drive] + (rp11.rpda[drive] & 0xff);
            diskIO(1, rp11.meta[drive], sector * 512, rp11.rpba, ((0x10000 - rp11.rpwc) & 0xffff) << 1);
            return;
            break;
        case 0o71: // read
            if (rp11.rpdc[drive] >= rp11.CYLINDERS[drive] || (rp11.rpda[drive] >>> 8) >= rp11.SURFACES[drive] ||
                (rp11.rpda[drive] & 0xff) >= rp11.SECTORS[drive]) {
                rp11.rper1[drive] |= 0x400; // invalid sector address
                rp11.rpcs1 |= 0xc000; // set SC & TRE
                break;
            }
            rp11.rpcs1 &= ~0x7000; // Turn error bits
            rp11.rpcs1 &= ~0x4080; // Turn TRE & ready off
            rp11.rpcs2 &= ~0x800; // Turn off NEM (NXM)
            rp11.rpds[drive] &= ~0x480; // Turn off LST & DRY
            sector = (rp11.rpdc[drive] * rp11.SURFACES[drive] + (rp11.rpda[drive] >>> 8)) * rp11.SECTORS[drive] + (rp11.rpda[drive] & 0xff);
            diskIO(2, rp11.meta[drive], sector * 512, rp11.rpba, ((0x10000 - rp11.rpwc) & 0xffff) << 1);
            return;
            break;
        default:
            panic();
            return;
            break;
    }
    interrupt(12, 5 << 5, 0o254, 0, function() {
        rp11.rpds[drive] |= 0x8000; // ATA
        rp11.rpcs1 |= 0x8000; // SC no
        if (rp11.rpcs1 & 0x40) return true;
        return false;
    });
}


function rp11_end(err, meta, position, address, count) {
    var sector, block = ~~((position + 511) / 512);
    rp11.rpwc = (0x10000 - (count >>> 1)) & 0xffff;
    rp11.rpba = address & 0x3fffff;
    sector = ~~(block / rp11.SECTORS[meta.drive]);
    rp11.rpda[meta.drive] = ((sector % rp11.SURFACES[meta.drive]) << 8) | (block % rp11.SECTORS[meta.drive]);
    rp11.rpdc[meta.drive] = ~~(sector / rp11.SURFACES[meta.drive]);
    if (block >= meta.maxblock) {
        rp11.rpds[meta.drive] |= 0x400; // LST
    }
    if (err) {
        rp11.rpds[meta.drive] |= 0x8000; //ATA
        rp11.rpcs1 |= 0xc000; // set SC & TRE
        switch (err) {
            case 1: // read error
                rp11.rpcs2 |= 0x200; // MXF Missed transfer
                break;
            case 2: // NXM
                rp11.rpcs2 |= 0x800; // NEM (NXM)
                break;
        }
    }
    interrupt(20, 5 << 5, 0o254, 0, function() {
        rp11.rpds[meta.drive] |= 0x80; // 0x8080 must be for rp0 boot - but manual indicates no?
        rp11.rpcs1 |= 0x80; // set ready
        if (rp11.rpcs1 & 0x40) return true;
        return false;
    });
}

function accessRP11(physicalAddress, data, byteFlag) {
    var idx, result;
    idx = rp11.rpcs2 & 7;
    switch (physicalAddress & ~1) { // RH11 always there addresses
        case 0o17776700: // rp11.rpcs1 Control status 1
            result = (rp11.rpcs1 & ~0xb01) | ((rp11.rpba >>> 8) & 0x300);
            if (rp11.rpds[idx] & 0x100) {
                result |= 0x800; // DVA depends on drive number
                if (!(rp11.rpcs1 & 0x80)) result |= 1; // go is opposite of rdy
            } else {
                result &= 0xff7f; // rdy off if no dva
            }
            rp11.rpcs1 = result;
            if (data >= 0) {
                result = insertData(result, physicalAddress, data, byteFlag);
                if (result >= 0) {
                    rp11.rpba = (rp11.rpba & 0x3cffff) | ((result << 8) & 0x30000);
                    result = (result & ~0xb880) | (rp11.rpcs1 & 0xb880);
                    if (!(result & 0x40)) interrupt(-1, 0, 0o254, 0); //remove pending interrupt if IE not set
                    if ((data & 0xc0) === 0xc0) interrupt(8, 5 << 5, 0o254, 0); // RB:
                    rp11.rpcs1 = result;
                    if (result & 1 && (rp11.rpcs1 & 0x80)) {
                        rp11_go();
                    }
                }
            }
            break;
        case 0o17776702: // rp11.rpwc  Word count
            result = insertData(rp11.rpwc, physicalAddress, data, byteFlag);
            if (result >= 0) rp11.rpwc = result;
            break;
        case 0o17776704: // rp11.rpba  Memory address
            result = rp11.rpba & 0xffff;
            if (data >= 0) {
                result = insertData(result, physicalAddress, data, byteFlag);
                if (result >= 0) {
                    rp11.rpba = (rp11.rpba & 0x3f0000) | (result & 0xfffe); // must be even
                }
            }
            break;
        case 0o17776710: // rp11.rpcs2 Control status 2
            result = rp11.rpcs2;
            if (data >= 0) {
                result = insertData(result, physicalAddress, data, byteFlag);
                if (result >= 0) {
                    rp11.rpcs2 = (result & 0x3f) | (rp11.rpcs2 & 0xffc0);
                    if (result & 0x20) rp11_init();
                }
            }
            break;
        case 0o17776716: // rp11.rpas  Attention summary
            result = 0;
            for (idx = 0; idx < 8; idx++) {
                if (rp11.rpds[idx] & 0x8000) {
                    if (data >= 0 && (data & (1 << idx))) {
                        rp11.rpds[idx] &= 0x7fff;
                    } else {
                        result |= 1 << idx;
                    }
                }
            }
            if (data > 0) rp11.rpcs1 &= 0x7fff; // Turn off SC
            break;
        case 0o17776722: // rp11.rpdb  Data buffer
            result = 0;
            break;
        case 0o17776750: // rp11.rpbae Bus address extension
            result = (rp11.rpba >>> 16) & 0x3f;
            if (data >= 0) {
                result = insertData(result, physicalAddress, data, byteFlag);
                if (result >= 0) {
                    rp11.rpba = ((result & 0x3f) << 16) | (rp11.rpba & 0xffff);
                }
            }
            break;
        case 0o17776752: // rp11.rpcs3 Control status 3
            // result = insertData(rp11.rpcs3, physicalAddress, data, byteFlag);
            // if (result >= 0) rp11.rpcs3 = result;
            result = 0;
            break;
        default:
            idx = rp11.rpcs2 & 7; // drive number
            if (rp11.rpds[idx] & 0x100) {
                switch (physicalAddress & ~1) { // Drive registers which may or may not be present
                    case 0o17776706: // rp11.rpda  Disk address
                        result = insertData(rp11.rpda[idx], physicalAddress, data, byteFlag);
                        if (result >= 0) rp11.rpda[idx] = result & 0x1f1f;
                        break;
                    case 0o17776712: // rp11.rpds  drive status
                        result = rp11.rpds[idx];
                        break;
                    case 0o17776714: // rp11.rper1 Error 1
                        result = 0; // rp11.rper1[idx];
                        break;
                    case 0o17776720: // rp11.rpla  Look ahead
                        result = 0; // rp11.rpla[idx];
                        break;
                    case 0o17776724: // rp11.rpmr  Maintenance
                        //result = insertData(rp11.rpmr[idx], physicalAddress, data, byteFlag);
                        //if (result >= 0) rp11.rpmr[idx] = result & 0x3ff;
                        result = 0;
                        break;
                    case 0o17776726: // rp11.rpdt  drive type read only
                        result = rp11.DTYPE[idx]; // 0o20022
                        break;
                    case 0o17776730: // rp11.rpsn  Serial number read only - lie and return drive + 1
                        result = idx + 1;
                        break;
                    case 0o17776732: // rp11.rpof  Offset register
                        result = insertData(rp11.rpof[idx], physicalAddress, data, byteFlag);
                        if (result >= 0) rp11.rpof[idx] = result;
                        //result = 0x1000;
                        break;
                    case 0o17776734: // rp11.rpdc  Desired cylinder
                        result = insertData(rp11.rpdc[idx], physicalAddress, data, byteFlag);
                        if (result >= 0) rp11.rpdc[idx] = result & 0x3ff;
                        break;
                    case 0o17776736: // rp11.rpcc  Current cylinder read only - lie and used desired cylinder
                        result = rp11.rpdc[idx];
                        break;
                    case 0o17776740: // rp11.rper2 Error 2
                        result = 0;
                        break;
                    case 0o17776742: // rp11.rper3 Error 3
                        result = 0; // rp11.rper3[idx];
                        break;
                    case 0o17776744: // rp11.rpec1 Error correction 1 read only
                        result = 0; // rp11.rpec1[idx];
                        break;
                    case 0o17776746: // rp11.rpec2 Error correction 2 read only
                        result = 0; //rp11.rpec2[idx];
                        break;
                    default:
                        return trap(0o4, 0x10); // Trap 4 - 0x10 Unibus time-out
                }
            } else {
                rp11.rpcs2 |= 0x1000; // NED
                rp11.rpcs1 |= 0xc000; // SC + TRE
                if (rp11.rpcs1 & 0x40) {
                    interrupt(5, 5 << 5, 0o254, 0);
                }
                result = 0;
            }
    }
    //console.log("RP11 " + physicalAddress.toString(8) + " " + byteFlag + " " + data.toString(8) + " => " + result.toString(8) + " @" + CPU.registerVal[7].toString(8));
    return result;
}


// =========== TM11 routines ===========


var tm11 = {
    mts: 0x65, // 17772520 Status Register    6 selr 5 bot 2 wrl 0 tur
    mtc: 0x6080, // 17772522 Command Register   14-13 bpi 7 cu rdy
    mtbrc: 0, // 17772524 Byte Record Counter
    mtcma: 0, // 17772526 Current Memory Address Register
    mtd: 0, // 17772530 Data Buffer Register
    mtrd: 0, // 17772532 TU10 Read Lines
    meta: [] //meta data for drive
};

function tm11_commandEnd() {
    tm11.mts |= 1; // tape unit ready
    tm11.mtc |= 0x80;
    return tm11.mtc & 0x40;
}

function tm11_finish() {
    if (tm11.mtc & 0x40) {
        interrupt(10, 5 << 5, 0o224, 0, tm11_commandEnd);
    } else { // if interrupt not enabled just mark completed
        tm11_commandEnd();
    }
}

function tm11_end(err, meta, position, address, count) {
    if (err === 0 && meta.command > 0) {
        if (address === 0 || address > 0x80000000) { // tape mark
            meta.position = (position + 1) & ~1;
            tm11.mts |= 0x4000; // set EOF bit
        } else {
            switch (meta.command) {
                case 1: // read
                    //meta.position = position + 2 + ((address + 1) >>> 1);
                    meta.position = (position + 4 + address + 1) & ~1;
                    meta.command = 0;
                    count = (0x10000 - tm11.mtbrc) & 0xffff;
                    if (count >= address || count === 0) {
                        count = address;
                        tm11.mtbrc = (tm11.mtbrc + count) & 0xffff;
                    } else {
                        tm11.mts |= 0x200; // RLE
                        tm11.mtbrc = 0;
                    }
                    address = ((tm11.mtc & 0x30) << 12) | tm11.mtcma;
                    diskIO(2, meta, position, address, count);
                    // calculate meta.position set count to reduced amount
                    return;
                case 4: // space forward
                    //position = position + 2 + ((address + 1) >>> 1);
                    position = (position + 4 + address + 1) & ~1;
                    meta.position = position;
                    tm11.mtbrc = (tm11.mtbrc + 1) & 0xffff;
                    if (tm11.mtbrc) {
                        diskIO(4, meta, position, 0, 4);
                        return;
                    }
                    break;
                case 5: // space reverse
                    //position = position - 4 - ((address + 1) >>> 1);
                    position = (position - 8 - address + 1) & ~1;
                    meta.position = position;
                    tm11.mtbrc = (tm11.mtbrc + 1) & 0xffff;
                    if (tm11.mtbrc) {
                        if (position > 0) {
                            diskIO(4, meta, position - 4, 0, 4);
                            return;
                        }
                    }
                    break;
                default:
                    panic();
            }
        }
    }
    if (meta.command === 0) {
        tm11.mtbrc = (tm11.mtbrc - count) & 0xffff;
        tm11.mtcma = address & 0xffff;
        tm11.mtc = (tm11.mtc & ~0x30) | ((address >>> 12) & 0x30);
    }
    switch (err) {
        case 1: // read error
            tm11.mts |= 0x100; // Bad tape error
            break;
        case 2: // NXM
            tm11.mts |= 0x80; // NXM
            break;
    }
    tm11_finish();
}

function tm11_init() {
    var i;
    tm11.mts = 0x65; //  6 selr 5 bot 2 wrl 0 tur
    tm11.mtc = 0x6080; //  14-13 bpi 7 cu rdy
    for (i = 0; i < 8; i++) {
        if (typeof tm11.meta[i] !== "undefined") {
            tm11.meta[i].position = 0;
        }
    }
}

function tm11_go() {
    var drive = (tm11.mtc >>> 8) & 3;
    tm11.mtc &= ~0x81; // ready bit (7!) and go (0)
    tm11.mts &= 0x04fe; // turn off tape unit ready
    if (typeof tm11.meta[drive] === "undefined") {
        tm11.meta[drive] = {
            "cache": [],
            "postProcess": tm11_end,
            "drive": drive,
            "mapped": 1,
            "maxblock": 0,
            "position": 0,
            "command": 0,
            "url": "tm" + drive + ".tap"
        };
    }
    tm11.meta[drive].command = (tm11.mtc >>> 1) & 7;
    //console.log("TM11 Function "+(tm11.meta[drive].command).toString(8)+" "+tm11.mtc.toString(8)+" "+tm11.mts.toString(8)+" @ "+tm11.meta[drive].position.toString(8));
    switch (tm11.meta[drive].command) { // function code
        case 0: // off-line
            break;
        case 1: // read
            diskIO(4, tm11.meta[drive], tm11.meta[drive].position, 0, 4);
            return;
        case 2: // write
        case 3: // write end of file
        case 6: // write with extended IRG
            break;
        case 4: // space forward
            diskIO(4, tm11.meta[drive], tm11.meta[drive].position, 0, 4);
            return;
        case 5: // space reverse
            if (tm11.meta[drive].position > 0) {
                //diskIO(4, tm11.meta[drive], tm11.meta[drive].position - 2, 0, 4);
                diskIO(4, tm11.meta[drive], tm11.meta[drive].position - 4, 0, 4);
                return;
            }
            break;
        case 7: // rewind
            tm11.meta[drive].position = 0;
            tm11.mts |= 0x20; // set BOT
            break;
        default:
            break;
    }
    tm11_finish();
}

function accessTM11(physicalAddress, data, byteFlag) {
    var result;
    switch (physicalAddress & ~1) {
        case 0o17772520: // tm11.mts
            tm11.mts &= ~0x20; // turn off BOT
            if (typeof tm11.meta[(tm11.mtc >>> 8) & 3] !== "undefined") {
                if (tm11.meta[(tm11.mtc >>> 8) & 3].position === 0) {
                    tm11.mts |= 0x20; // turn on BOT
                }
            }
            result = tm11.mts;
            break;
        case 0o17772522: // tm11.mtc
            tm11.mtc &= 0x7fff; // no err bit
            if (tm11.mts & 0xff80) tm11.mtc |= 0x8000;
            result = insertData(tm11.mtc, physicalAddress, data, byteFlag);
            if (data >= 0 && result >= 0) {
                if ((tm11.mtc & 0x40) && !(result & 0x40)) { // if IE being reset then kill any pending interrupts
                    interrupt(-1, 5 << 5, 0o224, -1);
                }
                if (result & 0x1000) { //init
                    tm11.mts = 0x65; //  6 selr 5 bot 2 wrl 0 tur
                    tm11.mtc = 0x6080; //  14-13 bpi 7 cu rdy
                }
                if ((tm11.mtc & 0x80) && (result & 0x1)) {
                    tm11.mtc = (tm11.mtc & 0x80) | (result & 0xff7f);
                    tm11_go();
                } else {
                    if ((result & 0x40) && (tm11.mtc & 0xc0) === 0x80) {
                        interrupt(10, 5 << 5, 0o224, 0);
                    }
                    tm11.mtc = (tm11.mtc & 0x80) | (result & 0xff7f);
                }
            }
            break;
        case 0o17772524: // tm11.mtbrc
            result = insertData(tm11.mtbrc, physicalAddress, data, byteFlag);
            if (result >= 0) tm11.mtbrc = result;
            break;
        case 0o17772526: // tm11.mtcma
            result = insertData(tm11.mtcma, physicalAddress, data, byteFlag);
            if (result >= 0) tm11.mtcma = result;
            break;
        case 0o17772530: // tm11.mtd
        case 0o17772532: // tm11.mtrd
            result = 0;
            break;
        default:
            return trap(0o4, 0x10); // Trap 4 - 0x10 Unibus time-out
    }
    //console.log("TM11 " + physicalAddress.toString(8) + " " + byteFlag + " " + data.toString(8) + " => " + result.toString(8) + " @" + CPU.registerVal[7].toString(8));
    return result;
}

// =========== PTR routines =========== CSR 017777550 Vector 70 BR4

var ptr11 = {
    prs: 0, // Done bit set
    pdb: 0,
    name: ""
};

function ptr11_init() {
    ptr11.prs = 0; // No prs bits set
    ptr11.name = document.getElementById("ptr").value;
    if (ptr11.name === "") {
        ptr11.prs = 0x8000; // Set Error
    }
    if (typeof ptr11.meta !== "undefined") {
        delete ptr11.meta; // Forget any existing tape details
    }

}

function ptr11_end(err, meta, position, address, count) {
    meta.position = position;
    ptr11.pdb = address & 0xff; // diskIO function 5 stores a byte in address
    ptr11.prs &= ~0x800; // Clear BUSY
    if (ptr11.prs & 0x40) {
        interrupt(6, 4 << 5, 0o70, 0);
    }
    if (err === 0) {
        ptr11.prs |= 0x80; // Set DONE
    } else {
        ptr11.prs |= 0x8000; // Set ERROR
    }
}

function accessPTR11(physicalAddress, data, byteFlag) {
    var result;
    switch (physicalAddress & 6) {
        case 0: //  ptr11.prs  017777550
            result = insertData(ptr11.prs, physicalAddress, data, byteFlag);
            if (result >= 0 && data > 0) {
                if ((result & 0x40) && !(ptr11.prs & 0x40) && (ptr11.prs & 0x8080)) {
                    interrupt(6, 4 << 5, 0o70, 0);
                }
                if (!(ptr11.prs & 0x8800) && (result & 1)) { // If not ERROR or BUSY and setting GO...
                    if (typeof ptr11.meta === "undefined") { // Make metadata if not there
                        ptr11.meta = {
                            "cache": [],
                            "postProcess": ptr11_end,
                            "mapped": 0,
                            "position": 0,
                            "url": ptr11.name
                        };
                    }
                    ptr11.prs = (ptr11.prs & ~0xc0) | (result & 0x40) | 0x800; // Clear DONE, write IE, and set BUSY
                    result = ptr11.prs;
                    diskIO(5, ptr11.meta, ptr11.meta.position, 0o17777552, 1); // Read a byte!
                }
            }
            break;
        case 2: // ptr11.pdb  017777552
            result = insertData(ptr11.pdb, physicalAddress, data, byteFlag);
            ptr11.prs = ptr11.prs & ~0x80; // Clear DONE,
    }
    //console.log("PTR11 " + physicalAddress.toString(8) + " " + byteFlag + " " + data.toString(8) + " => " + result.toString(8) + " @" + CPU.registerVal[7].toString(8));
    return result;
}

// =========== LP11 routines ===========

var lp11 = {
    lpcs: 0,
    lpdb: 0
};

function lp11_init() {
    lp11.lpcs = 0x80; // set done bit
}

function lp11_initialize() {
    document.getElementById("lp11").innerHTML = '<p>printer<br /><textarea id=lp11_id cols=132 rows=24 spellcheck=false style="font-family:Liberation Mono,Monaco,Courier New,Lucida Console,Consolas,DejaVu Sans Mono,Bitstream Vera Sans Mono,monospace"></textarea><br /><button onclick="document.getElementById(' + "'lp11_id'" + ').value=' + "''" + ';">Clear</button></p>';
    lp11.textElement = document.getElementById("lp11_id");
}


// =========== DL11 data (includes console as unit 0) ===========

var DL11 = []; // Space for the array of DL11 objects


function dl11_reset() { // Reset all units to initial state
    "use strict";
    var i;
    for (i = 0; i < DL11.length; i++) {
        DL11[i].rcsr = 0; // No received characters
        DL11[i].xcsr = 0x80; // Ready to transmit
        vt52Reset(i);
    }
}


function dl11_initialize(unit, vector) { // Called when a new terminal identified
    "use strict";
    var divElement;
    if (unit !== 0) {
        divElement = document.createElement('div');
        divElement.innerHTML = '<p>tty' + unit + '<br /><textarea id=' + unit + ' cols=132 rows=24 style="font-family:' + "'Courier New'" + ',Courier,' + "'Lucida Console'" + ',Monaco,monospace;" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"></textarea><br /></p>';
        document.getElementById('dl11').appendChild(divElement);
    }
    DL11[unit] = {
        rcsr: 0,
        rbuf: 0,
        xcsr: 0x80,
        xbuf: 0,
        vector: vector
    };
    vt52Initialize(unit, document.getElementById(unit), dl11Input);
}

function dl11Input(unit, ch) {
    "use strict";
    if (DL11[unit].rcsr & 0x80) { // Done set - last character not yet used
        return 0; // reject additional character
    }
    DL11[unit].rbuf = ch;
    DL11[unit].rcsr |= 0x80; // Set done
    if (DL11[unit].rcsr & 0x40) {
        interrupt(4, 4 << 5, DL11[unit].vector, 0);
    }
    return 1; // consume character
}


function accessDL11(physicalAddress, data, byteFlag, unit, vector) {
    "use strict";
    var result = 0;
    if (typeof DL11[unit] === "undefined") {
        dl11_initialize(unit, vector);
    }
    switch (physicalAddress & 0x6) {
        case 6: // DL xbuf
            result = insertData(DL11[unit].xbuf, physicalAddress, data, byteFlag);
            if (data >= 0 && result >= 0) {
                DL11[unit].xbuf = result;
                result &= 0x7f;
                if (result >= 8 && result < 127) {
                    vt52Put(unit, result);
                }
                if (DL11[unit].xcsr & 0x40) { // Cheat: leave Done permanently set
                    interrupt(4, 4 << 5, DL11[unit].vector + 4, 0);
                }
            }
            break;
        case 4: // DL xcsr
            result = insertData(DL11[unit].xcsr, physicalAddress, data, byteFlag);
            if (data >= 0 && result >= 0) {
                if (((DL11[unit].xcsr ^ result) & 0x40)) { // IE changed state?
                    if (result & 0x40) {
                        DL11[unit].xcsr = 0xc0; // Set done as well in case an interrupt was pending
                        interrupt(5, 4 << 5, DL11[unit].vector + 4, 0);
                    } else {
                        DL11[unit].xcsr &= 0x80; // Keep Done but clear IE
                        interrupt(-1, 4 << 5, DL11[unit].vector + 4, -1); // Clean interrupts from queue
                    }
                }
            }
            break;
        case 2: // DL rbuf
            result = insertData(DL11[unit].rbuf, physicalAddress, data, byteFlag);
            if (result >= 0 && data < 0) {
                DL11[unit].rcsr &= ~0x80;
            }
            break;
        case 0: // DL rcsr
            result = insertData(DL11[unit].rcsr, physicalAddress, data, byteFlag);
            if (result >= 0 && data >= 0) {
                if ((DL11[unit].rcsr & 0x40) && !(result & 0x40)) { // Did IE just get turned off?
                    interrupt(-1, 4 << 5, DL11[unit].vector, -1);
                }
                DL11[unit].rcsr = (DL11[unit].rcsr & 0x80) | (result & 0x40);
            }
            break;
    }
    //console.log("DL11 " + physicalAddress.toString(8) + " " + byteFlag + " " + data.toString(8) + " => " + result.toString(8) + " @" + CPU.registerVal[7].toString(8));
    return result;
}


// =========== KW11 routines ===========

var kw11 = {
    csr: 0,
    timerId: null,
    interruptTime: 0
};

function kw11_init() {
    "use strict";
    kw11.csr = 0x80;
    if (kw11.timerId === null) { // If not initialized set timer for every 20ms (50Hz)
        kw11.timerId = setTimeout(kw11_interrupt, 20);
    }
}

function kw11_interrupt() { // Called every 20 ms (50 Hz) to check whether time exhausted
    "use strict";
    var timeNow = Date.now();
    kw11.interruptTime += 20;
    if (timeNow - kw11.interruptTime > 30000) { // Try to time accurately but give up if 30 seconds behind
        kw11.interruptTime = timeNow + 20;
    }
    setTimeout(kw11_interrupt, Math.max(0, kw11.interruptTime - timeNow));
    if (CPU.runState !== STATE_HALT) {
        kw11.csr |= 0x80; //Set DONE
        if (kw11.csr & 0x40) { // If IE
            interrupt(0, 6 << 5, 0o100, 0);
        }
    }
}


// Initialize unibus things for a reset instruction

function reset_iopage() {
    "use strict";
    CPU.PIR = 0;
    CPU.stackLimit = 0xff;
    CPU.CPU_Error = 0;
    CPU.interruptQueue = [];
    CPU.MMR0 = CPU.MMR3 = CPU.MMR3KSxU = CPU.mmuEnable = 0;
    setMMUmode(0);
    CPU.mmuLastPage = 0;
    dl11_reset();
    ptr11_init();
    lp11_init();
    kw11_init();
    rk11_init();
    rl11.csr = 0x80;
    rp11_init();
    tm11_init();
	setBaseLights();
}


// Map an 18 bit unibus address to a 22 bit memory address via the unibus map (if active)
//
//
function mapUnibus(unibusAddress) {
    "use strict";
    var idx = (unibusAddress >>> 13) & 0x1f;
    if (idx < 31) {
        if (CPU.MMR3 & 0x20) {
            unibusAddress = (CPU.unibusMap[idx] + (unibusAddress & 0x1fff)) & 0x3fffff;
        }
    } else {
        unibusAddress |= IOBASE_22BIT; // top page always maps to unibus i/o page - apparently.
    }
    return unibusAddress;
}

// Update a word with new byte or word data allowing for odd addressing

function insertData(original, physicalAddress, data, byteFlag) {
    "use strict";
    if (physicalAddress & 1) {
        if (!byteFlag) {
            return trap(0o4, 0x40); // Trap 4 - 0x40 Odd address error
        }
        if (data >= 0) {
            data = ((data << 8) & 0xff00) | (original & 0xff);
        } else {
            data = original;
        }
    } else {
        if (data >= 0) {
            if (byteFlag) {
                data = (original & 0xff00) | (data & 0xff);
            }
        } else {
            data = original;
        }
    }
    return data;
}

// Access to the 4K unibus I/O page - data is positive for a write or negative for a read

function access_iopage(physicalAddress, data, byteFlag) { // access_iopage() handles all I/O page requests
    "use strict";
    var result, idx;
    switch (physicalAddress & ~0o77) { // Break addressing up into blocks with common lower 6 bits
        case 0o17777700: // 017777700 - 017777777 First block is highest addresses including PSW, stack limit, PIR, etc
            switch (physicalAddress & ~1) {
                case 0o17777776: // PSW
                    result = insertData(readPSW(), physicalAddress, data, byteFlag);
                    if (result >= 0 && data >= 0) {
                        writePSW(result);
                        return -1; // Kludge - signals no further processing to prevent changes to PSW
                    }
                    break;
                case 0o17777774: // stack limit
                    result = insertData(CPU.stackLimit, physicalAddress, data, byteFlag);
                    if (result >= 0) {
                        if (data >= 0) {
                            CPU.stackLimit = result | 0xff; // Use stack limit with lower byte bits set
                        }
                        result &= 0xff00;
                    }
                    break;
                case 0o17777772: // PIR
                    result = insertData(CPU.PIR, physicalAddress, data, byteFlag);
                    if (result >= 0 && data >= 0) {
                        result &= 0xfe00;
                        if (result) { // Need to calculate priority level from priority mask
                            idx = result >>> 9;
                            do {
                                result += 0x22;
                            } while (idx >>= 1);
                        }
                        CPU.PIR = result;
                        if ((result & 0xe0) > (CPU.PSW & 0xe0)) {
                            CPU.priorityReview = 1; // Schedule an interrupt priority review if required
                        }
                    }
                    break;
                case 0o17777766: // CPU error
                    if (CPU.cpuType !== 70) {
                        result = trap(0o4, 0x10); // Trap 4 - 0x10 Unibus time-out
                    } else {
                        result = insertData(CPU.CPU_Error, physicalAddress, data, byteFlag);
                        if (result >= 0 && data >= 0) {
                            result = CPU.CPU_Error = 0; // Always writes as zero?
                        }
                    }
                    break;
                case 0o17777764: // System I/D
                    if (CPU.cpuType !== 70) {
                        result = trap(0o4, 0x10); // Trap 4 - 0x10 Unibus time-out
                    } else {
                        result = insertData(1, physicalAddress, data, byteFlag);
                    }
                    break;
                case 0o17777762: // Upper size
                    if (CPU.cpuType !== 70) {
                        result = trap(0o4, 0x10); // Trap 4 - 0x10 Unibus time-out
                    } else {
                        result = insertData(0, physicalAddress, data, byteFlag);
                    }
                    break;
                case 0o17777760: // Lower size
                    if (CPU.cpuType !== 70) {
                        result = trap(0o4, 0x10); // Trap 4 - 0x10 Unibus time-out
                    } else {
                        result = insertData((MAX_MEMORY >>> 6) - 1, physicalAddress, data, byteFlag);
                    }
                    break;
                case 0o17777770: // Microprogram break
                    if (data >= 0 && !(physicalAddress & 1)) data &= 0xff; // Required for KB11-CM without MFPT instruction
                case 0o17777756: //
                case 0o17777754: //
                case 0o17777752: // Hit/miss
                case 0o17777750: // Maintenance
                case 0o17777746: // Cache control
                case 0o17777744: // Memory system error
                case 0o17777742: // High error address
                case 0o17777740: // Low error address
                    if (CPU.cpuType !== 70) {
                        result = trap(0o4, 0x10); // Trap 4 - 0x10 Unibus time-out
                    } else {
                        idx = (physicalAddress - 0o17777740) >>> 1;
                        result = insertData(CPU.controlReg[idx], physicalAddress, data, byteFlag);
                        if (result >= 0) {
                            if ((physicalAddress & ~1) === 0o17777746) result = 0o17;
                            if ((physicalAddress & ~1) === 0o17777742) result = 0o3;
                            if ((physicalAddress & ~1) === 0o17777740) result = 0o177740;
                            CPU.controlReg[idx] = result;
                        }
                    }
                    break;
                case 0o17777716: // User and Super SP - note the use of odd word addresses requiring return
                    if (physicalAddress & 1) {
                        if (CPU.mmuMode === 3) { // User Mode SP
                            if (data >= 0) CPU.registerVal[6] = data;
                            result = CPU.registerVal[6];
                        } else {
                            if (data >= 0) CPU.stackPointer[3] = data;
                            result = CPU.stackPointer[3];
                        }
                    } else {
                        if (CPU.mmuMode === 1) { // Super Mode SP
                            if (data >= 0) CPU.registerVal[6] = data;
                            result = CPU.registerVal[6];
                        } else {
                            if (data >= 0) CPU.stackPointer[1] = data;
                            result = CPU.stackPointer[1];
                        }
                    }
                    return result; // special exit to allow for odd address word access
                case 0o17777714:
                case 0o17777712:
                case 0o17777710: // Register set 1
                    idx = physicalAddress & 7;
                    if (CPU.PSW & 0x800) {
                        if (data >= 0) CPU.registerVal[idx] = data;
                        result = CPU.registerVal[idx];
                    } else {
                        if (data >= 0) CPU.registerAlt[idx] = data;
                        result = CPU.registerAlt[idx];
                    }
                    return result; // special exit to allow for odd address word access
                case 0o17777706: // Kernel SP & PC
                    if (physicalAddress & 1) {
                        if (data >= 0) CPU.registerVal[7] = data;
                        result = CPU.registerVal[7];
                    } else {
                        if (CPU.mmuMode === 0) { // Kernel Mode
                            if (data >= 0) CPU.registerVal[6] = data;
                            result = CPU.registerVal[6];
                        } else {
                            if (data >= 0) CPU.stackPointer[0] = data;
                            result = CPU.stackPointer[0];
                        }
                    }
                    return result; // special exit to allow for odd address word access
                case 0o17777704:
                case 0o17777702:
                case 0o17777700: // Register set 0
                    idx = physicalAddress & 7;
                    if (CPU.PSW & 0x800) {
                        if (data >= 0) CPU.registerAlt[idx] = data;
                        result = CPU.registerAlt[idx];
                    } else {
                        if (data >= 0) CPU.registerVal[idx] = data;
                        result = CPU.registerVal[idx];
                    }
                    return result; // special exit to allow for odd address word access
                default:
                    result = trap(0o4, 0x10); // Trap 4 - 0x10 Unibus time-out
            }
            break;
        case 0o17777600: // 017777600 - 017777677 MMU user mode 3 Map
            idx = (physicalAddress >>> 1) & 0o37;
            if (idx <= 15) { // PDR's come first
                result = insertData(CPU.mmuPDR[48 | idx], physicalAddress, data, byteFlag);
                if (result >= 0) {
                    CPU.mmuPDR[48 | idx] = result & 0xff0f;
                }
            } else { // Then PAR's
                idx &= 0xf;
                result = insertData(CPU.mmuPAR[48 | idx] >>> 6, physicalAddress, data, byteFlag);
                if (result >= 0) {
                    CPU.mmuPAR[48 | idx] = result << 6;
                    CPU.mmuPDR[48 | idx] &= 0xff0f;
                }
            }
            break;
        case 0o17777500: // 017777500 - 017777577 MMR0 MMR1 MMR2 Console KW11
            switch (physicalAddress & ~1) {
                case 0o17777576: // MMR2
                    result = insertData(CPU.MMR2, physicalAddress, data, byteFlag);
                    if (result >= 0) {
                        CPU.MMR2 = result;
                    }
                    break;
                case 0o17777574: // MMR1
                    result = CPU.MMR1;
                    if (result & 0xff00) result = ((result << 8) | (result >>> 8)) & 0xffff;
                    break;
                case 0o17777572: // MMR0
                    if (!(CPU.MMR0 & 0xe000)) {
                        CPU.MMR0 = (CPU.MMR0 & 0xf381) | (CPU.mmuLastPage << 1);
                    }
                    result = insertData(CPU.MMR0, physicalAddress, data, byteFlag);
                    if (result >= 0 && data >= 0) {
                        CPU.MMR0 = result &= 0xf381;
                        CPU.mmuLastPage = (result >>> 1) & 0x3f;
                        if (result & 0x101) {
                            if (result & 0x1) {
                                CPU.mmuEnable = MMU_READ | MMU_WRITE;
                            } else {
                                CPU.mmuEnable = MMU_WRITE;
                            }
                        } else {
                            CPU.mmuEnable = 0;
							CPU.mmuLastPage = 0; // Data light off
                        }
						setBaseLights();
                    }
                    break;
                case 0o17777570: // console panel display/switch;
                    if (data < 0) {
                        result = CPU.switchRegister & 0xffff;
                    } else {
                        result = insertData(CPU.displayRegister, physicalAddress, data, byteFlag);
                        if (result >= 0) CPU.displayRegister = result;
                    }
                    break;
                case 0o17777566: // console tty xbuf
                case 0o17777564: // console tty xcsr
                case 0o17777562: // console tty rbuf
                case 0o17777560: // console tty rcsr
                    result = accessDL11(physicalAddress, data, byteFlag, 0, 0o60);
                    break;
                case 0o17777550: // PTR psr
                case 0o17777552: // PTR pdb
                    result = accessPTR11(physicalAddress, data, byteFlag);
                    break;
                case 0o17777546: // kw11.csr
                    result = insertData(kw11.csr, physicalAddress, data, byteFlag);
                    if (data >= 0 && result >= 0) {
                        result &= 0x40;
                        if ((result ^ kw11.csr) & 0x40) { // Is IE changing?
                            if (result & 0x40) { // If turning on interrupt now for diags (otherwise timing is too slow)
                                result |= 0x80; //Set DONE
                                interrupt(10, 6 << 5, 0o100, 0);
                            } else {
                                interrupt(-1, 6 << 5, 0o100, -1); // Clear anything already in queue
                            }
                        }
                        kw11.csr = result;
                    }
                    //console.log("KW11 " + physicalAddress.toString(8) + " " + byteFlag + " " + data.toString(8) + " => " + result.toString(8) + " @" + CPU.registerVal[7].toString(8));
                    break;
                case 0o17777516: // line printer lpdb buffer
                    result = insertData(lp11.lpdb, physicalAddress, data, byteFlag);
                    if (data >= 0 && result >= 0) {
                        if (typeof lp11.textElement === "undefined") {
                            lp11_initialize();
                        }
                        lp11.lpdb = result & 0x7f;
                        if (lp11.lpdb >= 0o12 && lp11.lpdb !== 0o15) {
                            lp11.textElement.value += String.fromCharCode(lp11.lpdb);
                        }
                        if (lp11.lpcs & 0x40) {
                            lp11.lpcs &= ~0x80; // Turn off Done until interrupt
                            interrupt(10, 4 << 5, 0o200, 0, function() {
                                lp11.lpcs |= 0x80;
                                return (lp11.lpcs & 0x40);
                            });
                        }
                    }
                    break;
                case 0o17777514: // line printer lpcs control register
                    result = insertData(lp11.lpcs, physicalAddress, data, byteFlag);
                    if (data >= 0 && result >= 0) {
                        if ((result ^ lp11.lpcs) & 0x40) { // IE changed state?
                            if (result & 0x40) {
                                lp11.lpcs = 0xc0; // Set done as well in case an interrupt was pending
                                interrupt(0, 4 << 5, 0o200, 0);
                            } else {
                                lp11.lpcs &= 0x80; // Keep Done but clear IE
                            }
                        }
                    }
                    break;
                default:
                    result = trap(0o4, 0x10); // Trap 4 - 0x10 Unibus time-out
            }
            break;
        case 0o17777400: // 017777400 - 017777477 rk11 controller
            result = accessRK11(physicalAddress, data, byteFlag);
            break;
        case 0o17776700: // 017776700 - 017776777 rp11 controller
            if (physicalAddress <= 0o17776753) {
                result = accessRP11(physicalAddress, data, byteFlag);
            } else {
                if (typeof accessADCR !== 'undefined') {
                    result = accessADCR(physicalAddress, data, byteFlag);
                } else {
                    result = trap(0o4, 0x10); // Trap 4 - 0x10 Unibus time-out
                }
            }
            break;
        case 0o17776500: // 017776500 - 017776577 dl11 controller
            if (physicalAddress >= 0o17776500 && physicalAddress <= 0o17776527) {
                idx = (physicalAddress - 0o17776500) >>> 3;
                result = accessDL11(physicalAddress, data, byteFlag, idx + 1, idx * 8 + 0o300);
            } else {
                result = trap(0o4, 0x10); // Trap 4 - 0x10 Unibus time-out
            }
            break;
        case 0o17774400: // 017774400 - 017774477 rl11 controller
            result = accessRL11(physicalAddress, data, byteFlag);
            break;
        case 0o17772500: // 017772500 - 017772577 MMR3
            switch (physicalAddress & ~1) {
                case 0o17772516: // MMR3 - UB 22 x K S U
                    result = insertData(CPU.MMR3, physicalAddress, data, byteFlag);
                    if (result >= 0 && data >= 0) {
                        if (CPU.cpuType !== 70) result &= ~0x30; // don't allow 11/45 to do 22 bit or use unibus map
                        CPU.MMR3 = result;
						CPU.MMR3KSxU = (result & 6) << 1 | (result & 1);  //  Convert KSU to KSxU for faster access
						setBaseLights();
                        setMMUmode(CPU.mmuMode);
                    }
                    break;
                default:
                    result = accessTM11(physicalAddress, data, byteFlag);
                    break;
            }
            break;
        case 0o17772300: // 017772300 - 017772377 MMU kernel mode 0 Map
            idx = (physicalAddress >>> 1) & 0o37;
            if (idx <= 15) { // PDR's come first
                result = insertData(CPU.mmuPDR[0 | idx], physicalAddress, data, byteFlag);
                if (result >= 0) {
                    CPU.mmuPDR[0 | idx] = result & 0xff0f;
                }
            } else { // Then PAR's
                idx &= 0xf;
                result = insertData(CPU.mmuPAR[0 | idx] >>> 6, physicalAddress, data, byteFlag);
                if (result >= 0) {
                    CPU.mmuPAR[0 | idx] = result << 6;
                    CPU.mmuPDR[0 | idx] &= 0xff0f;
                }
            }
            break;
        case 0o17772200: // 017772200 - 017772277 MMU super mode 1 Map
            idx = (physicalAddress >>> 1) & 0o37;
            if (idx <= 15) { // PDR's come first
                result = insertData(CPU.mmuPDR[16 | idx], physicalAddress, data, byteFlag);
                if (result >= 0) {
                    CPU.mmuPDR[16 | idx] = result & 0xff0f;
                }
            } else { // Then PAR's
                idx &= 0xf;
                result = insertData(CPU.mmuPAR[16 | idx] >>> 6, physicalAddress, data, byteFlag);
                if (result >= 0) {
                    CPU.mmuPAR[16 | idx] = result << 6;
                    CPU.mmuPDR[16 | idx] &= 0xff0f;
                }
            }
            break;
        case 0o17772000: // 017772000 - 017772006 vt11 display
            if (typeof accessVT11 !== 'undefined') {
                result = accessVT11(physicalAddress, data, byteFlag);
            } else {
                result = trap(0o4, 0x10); // Trap 4 - 0x10 Unibus time-out
            }
            break;
        case 0o17770300: // 017770300 - 017770377 Unibus Map
        case 0o17770200: // 017770200 - 017770277 Unibus Map
            if (CPU.cpuType !== 70) {
                result = trap(0o4, 0x10); // Trap 4 - 0x10 Unibus time-out
            } else {
                idx = (physicalAddress >>> 2) & 0x1f;
                result = CPU.unibusMap[idx];
                if (physicalAddress & 0o2) result = (result >>> 16) & 0x803f; // Low six bits plus top bit (!)
                result = insertData(result & 0xffff, physicalAddress, data, byteFlag);
                if (result >= 0 && data >= 0) {
                    if (physicalAddress & 0o2) {
                        CPU.unibusMap[idx] = ((result & 0x803f) << 16) | (CPU.unibusMap[idx] & 0xfffe);
                    } else {
                        CPU.unibusMap[idx] = (CPU.unibusMap[idx] & 0x803f0000) | (result & 0xfffe);
                    }
                }
            }
            break;
        case 0o17767700: // 017767700 - 017767777 vg11 display
            if (typeof accessVG11 !== 'undefined') {
                result = accessVG11(physicalAddress, data, byteFlag);
            } else {
                result = trap(0o4, 0x10); // Trap 4 - 0x10 Unibus time-out
            }
            break;
        default:
            result = trap(0o4, 0x10); // Trap 4 - 0x10 Unibus time-out
    }
    if (byteFlag && result >= 0) { // Make any required byte adjustment to the return result
        if ((physicalAddress & 1)) {
            result = result >>> 8;
        } else {
            result &= 0xff;
        }
    }
    if (result < 0) { // on failure set Address Error light
        console.log("IOPAGE nxm failure " + physicalAddress.toString(8) + " " + data.toString(8) + " @" + CPU.registerVal[7].toString(8));
    }
    return result;
}