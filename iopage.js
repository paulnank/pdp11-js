// Javascript PDP 11/70 Emulator v4.0
// written by Paul Nankervis
// Please send suggestions, fixes and feedback to paulnank@hotmail.com
//
// This code may be used freely provided the original author name is acknowledged in any modified source code
//
//
// This code emulates the function of the PDP 11/70 i/o page
//
// iopage handles access to the unibus i/o page. devices register their unibus
// addresses and functions to handle access, interrupt polling and reset here.
// unibus access is handled in 4 word (8 byte) chunks so some devices may require
// multiple entries in the deviceAccess table. two different devices with addresses
// in the same chunk would require a combined access handler - but none seen yet.
//
var iopage = (function() {
    "use strict";
    var deviceList = [], // list of devices on the i/o page (used for reset)
        devicePoll = [], // list of device poll functions which do interrupt checks
        deviceAccess = new Array(0o17777 >>> 3); // device access functions by unibus address
    return {
        // function to handle all unibus iopage access requests
        access: function(physicalAddress, data, byteFlag) {
            "use strict";
            var result;
            let access = deviceAccess[(physicalAddress & 0o17777) >>> 3];
            if (access !== undefined) {
                result = access(physicalAddress, data, byteFlag);
            } else {
                result = trap(0o4, 0x10); // Trap 4 - 0x10 Unibus time-out
            }
            if (result >= 0) {
                if (byteFlag) {
                    if ((physicalAddress & 1)) {
                        result = result >>> 8;
                    } else {
                        result &= 0xff;
                    }
                }
            } else {
                if (physicalAddress !== 0o17777776) { // Special case for PSW
                    console.log("IOPAGE nxm failure " + physicalAddress.toString(8) + " " + data.toString(8) + " @" + CPU.registerVal[7].toString(8));
                }
            }
            return result;
        },
        // function to poll all devices and trigger an interrupt trap if required
        poll: function() {
            "use strict";
            var highPriority = CPU.PIR & 0xe0,
                highIndex = -1;
            CPU.interruptRequested = 0;
            for (let index = devicePoll.length - 1; index >= 0; index--) {
                let devicePriority = devicePoll[index](0); // get level device wants to interrupt at
                if (devicePriority > highPriority) {
                    highIndex = index;
                    highPriority = devicePriority;
                }
            }
            if (highPriority > (CPU.PSW & 0xe0)) { // Check if we found an interrupt to service
                if (highIndex < 0) {
                    trap(0o240, 0x00); // Trap 240 - 0x00 PIR trap
                } else {
                    trap(devicePoll[highIndex](1), 0x00); // Device trap - 0x00 BR trap and mark interrupt request complete
                }
                return 1;
            }
            return 0;
        },
        // function to register a device on the i/o page
        register: function(address, count, device) {
            "use strict";
            deviceList.push(device);
            if (device.poll !== undefined) {
                devicePoll.push(device.poll);
            }
            if ((address & 0o17760000) !== 0o17760000) {
                console.log("iopage.register invalid address:" + address.toString(8));
            }
            for (let index = (address & 0o17777) >>> 3; count > 0; count -= 4, index++) {
                if (deviceAccess[index] !== undefined) {
                    console.log("iopage.register address inuse:" + address.toString(8));
                }
                deviceAccess[index] = device.access;
            }
        },
        // function to reset all devices which contain a reset function
        reset: function() {
            "use strict";
            for (let index = 0; index < deviceList.length; index++) {
                let device = deviceList[index];
                if (device !== undefined && device.reset !== undefined) {
                    device.reset();
                }
            }
        }
    };
})();

// helper function to merge a new word or byte with an existing word

function insertData(original, physicalAddress, data, byteFlag) {
    "use strict";
    if (byteFlag) {
        if (data < 0) {
            return original;
        } else {
            if (physicalAddress & 1) {
                return ((data << 8) & 0xff00) | (original & 0xff);
            } else {
                return (original & 0xff00) | (data & 0xff);
            }
        }
    } else {
        if (physicalAddress & 1) {
            return trap(0o4, 0x40); // Trap 4 - 0x40 Odd address error
        } else {
            if (data < 0) {
                return original;
            } else {
                return data;
            }
        }
    }
}

// request main loop to do an interrupt status check

function requestInterrupt() {
    "use strict";
    CPU.interruptRequested = 1;
    if (CPU.runState === STATE_WAIT) { // if currently in wait then resume
        CPU.runState = STATE_RUN;
    }
}

// register micro break, pir, stack limit and psw on the i/o page

iopage.register(0o17777770, 4, (function() {
    var microBreak = 0; // 17777770 Microprogram break
    function init() {
        "use strict";
        CPU.PIR = 0;
        CPU.stackLimit = 0xff;
        CPU.CPU_Error = 0;
        CPU.MMR0 = CPU.MMR3 = CPU.MMR3KSxU = CPU.mmuEnable = 0;
        setMMUmode(0);
        CPU.mmuLastPage = 0;
    }
    init();
    return {
        access: function(physicalAddress, data, byteFlag) {
            "use strict";
            var result;
            switch (physicalAddress & 0o17777776) {
                case 0o17777770: // Microprogram break
                    result = insertData(microBreak, physicalAddress, data, byteFlag);
                    if (result >= 0 && data >= 0) {
                        microBreak = result & 0xff;
                    }
                    break;
                case 0o17777772: // 17777772 pir
                    result = insertData(CPU.PIR, physicalAddress, data, byteFlag);
                    if (result >= 0 && data >= 0) {
                        result &= 0xfe00;
                        if (result) { // Need to calculate priority level from priority mask
                            let index = result >>> 9;
                            do {
                                result += 0x22;
                            } while (index >>= 1);
                        }
                        CPU.PIR = result;
                        if ((result & 0xe0) > (CPU.PSW & 0xe0)) {
                            requestInterrupt(); // request an interrupt if priority higher than current
                        }
                    }
                    break;
                case 0o17777774: // 17777774 stack limit
                    result = insertData(CPU.stackLimit, physicalAddress, data, byteFlag);
                    if (result >= 0) {
                        if (data >= 0) {
                            CPU.stackLimit = result | 0xff; // stack limit has lower byte bits set
                        }
                        result &= 0xff00;
                    }
                    break;
                case 0o17777776: // 17777776 PSW
                    result = insertData(readPSW(), physicalAddress, data, byteFlag);
                    if (data >= 0 && result >= 0) {
                        writePSW(result);
                        return -1; // Kludge - signals no further processing to prevent changes to PSW
                    }
                    break;
            }
            return result;
        },
        reset: init
    };
})());

// register miscellaneous 11/70 registers on i/o page

if (CPU_TYPE === 70) { // 11/45 doesn't have these
    iopage.register(0o17777760, 4, {
        access: function(physicalAddress, data, byteFlag) {
            "use strict";
            var result;
            switch (physicalAddress & 0o17777776) {
                case 0o17777760: // Lower size
                    result = insertData((MAX_MEMORY >>> 6) - 1, physicalAddress, data, byteFlag);
                    break;
                case 0o17777762: // Upper size
                    result = insertData(0, physicalAddress, data, byteFlag);
                    break;
                case 0o17777764: // System I/D
                    result = insertData(1, physicalAddress, data, byteFlag);
                    break;
                case 0o17777766: // CPU error
                    result = insertData(CPU.CPU_Error, physicalAddress, data, byteFlag);
                    if (result >= 0 && data >= 0) {
                        CPU.CPU_Error = 0; // always writes as zero
                    }
                    break;
            }
            return result;
        }
    });
}

// register 11/70 maintenance registers on i/o page

if (CPU_TYPE === 70) { // 11/45 doesn't have these
    iopage.register(0o17777750, 4, {
        access: function(physicalAddress, data, byteFlag) {
            "use strict";
            var result;
            switch (physicalAddress & 0o17777776) {
                case 0o17777750: // Maintenance
                case 0o17777752: // Hit/miss
                case 0o17777754: //
                case 0o17777756: //
                    result = insertData(0, physicalAddress, data, byteFlag);
                    break;
            }
            return result;
        }
    });
}

// register 11/70 memory control registers on i/o page

if (CPU_TYPE === 70) { // 11/45 doesn't have these
    iopage.register(0o17777740, 4, {
        access: function(physicalAddress, data, byteFlag) {
            "use strict";
            var result;
            switch (physicalAddress & 0o17777776) {
                case 0o17777740: // Low error address
                    result = insertData(0o177740, physicalAddress, data, byteFlag);
                    break;
                case 0o17777742: // High error address
                    result = insertData(0o3, physicalAddress, data, byteFlag);
                    break;
                case 0o17777744: // Memory system error
                    result = insertData(0, physicalAddress, data, byteFlag);
                    break;
                case 0o17777746: // Cache control
                    result = insertData(0o17, physicalAddress, data, byteFlag);
                    break;
            }
            return result;
        }
    });
}

// put register set 0 onto the i/o page

iopage.register(0o17777700, 4, {
    access: function(physicalAddress, data, byteFlag) {
        "use strict";
        var result, index;
        index = physicalAddress & 7;
        switch (index) { // no byte stuff here!
            default: // register set 0 (R0 - R5)
                if (CPU.PSW & 0x800) { // where is register set 0 now?
                    if (data >= 0) CPU.registerAlt[index] = data;
                    result = CPU.registerAlt[index];
                } else {
                    if (data >= 0) CPU.registerVal[index] = data;
                    result = CPU.registerVal[index];
                }
                break;
            case 0o6: // 17777706 kernel SP
                if (CPU.mmuMode === 0) { // if in kernel Mode...
                    if (data >= 0) CPU.registerVal[6] = data;
                    result = CPU.registerVal[6];
                } else {
                    if (data >= 0) CPU.stackPointer[0] = data;
                    result = CPU.stackPointer[0];
                }
                break;
            case 0o7: // 17777707 kernel PC
                if (data >= 0) CPU.registerVal[7] = data;
                result = CPU.registerVal[7];
                break;
        }
        return result; // this block is special as it doesn't do byte handling
    }
});

// put register set 1 onto the i/o page

iopage.register(0o17777710, 4, {
    access: function(physicalAddress, data, byteFlag) {
        "use strict";
        var result, index;
        index = physicalAddress & 7;
        switch (index) { // no byte stuff here!
            default: // register set 1 (R0 - R5)
                if (CPU.PSW & 0x800) { // where is register set 1 now?
                    if (data >= 0) CPU.registerVal[index] = data;
                    result = CPU.registerVal[index];
                } else {
                    if (data >= 0) CPU.registerAlt[index] = data;
                    result = CPU.registerAlt[index];
                }
                break;
            case 0o6: // 17777716 super SP
                if (CPU.mmuMode === 1) { // if in super mode...
                    if (data >= 0) CPU.registerVal[6] = data;
                    result = CPU.registerVal[6];
                } else {
                    if (data >= 0) CPU.stackPointer[1] = data;
                    result = CPU.stackPointer[1];
                }
                break;
            case 0o7: // 17777717 user SP
                if (CPU.mmuMode === 3) { // if in user mode...
                    if (data >= 0) CPU.registerVal[6] = data;
                    result = CPU.registerVal[6];
                } else {
                    if (data >= 0) CPU.stackPointer[3] = data;
                    result = CPU.stackPointer[3];
                }
                break;
        }
        return result; // this block is special as it doesn't do byte handling
    }
});

// register console switches and lights, mmr0, mmr1 and mmr2 on i/o page

iopage.register(0o17777570, 4, {
    access: function(physicalAddress, data, byteFlag) {
        "use strict";
        var result;
        switch (physicalAddress & 0o17777776) {
            case 0o17777570: // 17777570 console panel display/switch;
                result = insertData(CPU.switchRegister & 0xffff, physicalAddress, data, byteFlag);
                if (result >= 0 && data >= 0) {
                    CPU.displayRegister = result;
                }
                break;
            case 0o17777572: // 17777572 MMR0
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
                }
                break;
            case 0o17777574: // 17777574 MMR1
                result = CPU.MMR1;
                if (result & 0xff00) {
                    result = ((result << 8) | (result >>> 8)) & 0xffff;
                }
                break;
            case 0o17777576: // 17777576 MMR2
                result = insertData(CPU.MMR2, physicalAddress, data, byteFlag);
                if (result >= 0) {
                    CPU.MMR2 = result;
                }
                break;
        }
        return result;
    }
});

// register mmr3 on i/o page (all by its lonesome self!)

iopage.register(0o17772510, 1, {
    access: function(physicalAddress, data, byteFlag) {
        "use strict";
        var result;
        switch (physicalAddress & 0o17777776) {
            case 0o17772516: // 17772516 MMR3 - UB 22 x K S U
                result = insertData(CPU.MMR3, physicalAddress, data, byteFlag);
                if (result >= 0 && data >= 0) {
                    if (CPU_TYPE !== 70) {
                        result &= ~0x30; // don't allow 11/45 to do 22 bit or use unibus map
                    }
                    CPU.MMR3 = result;
                    setMMUmode(CPU.mmuMode);
                }
                break;
            default:
                return trap(0o4, 0x10); // Trap 4 - 0x10 Unibus time-out
        }
        return result;
    }
});

// access function for memory management PDR registers

var mmuRegisterPDR = {
    access: function(physicalAddress, data, byteFlag) {
        "use strict";
        var result, index; // PDR is an array of 16 descriptors for kernel, followed by 16 for super, 16 unused and 16 for user mode
        index = (((physicalAddress & 0o0600) >>> 3) ^ ((physicalAddress & 0o0100) >>> 2)) | ((physicalAddress >>> 1) & 0o17);
        result = insertData(CPU.mmuPDR[index], physicalAddress, data, byteFlag);
        if (result >= 0) {
            CPU.mmuPDR[index] = result & 0xff0f;
        }
        return result;
    }
};

// access function for memory management PAR registers

var mmuRegisterPAR = {
    access: function(physicalAddress, data, byteFlag) {
        "use strict";
        var result, index; // Index becomes 0-15 for kernel mode, 16-31 for super, and 48-63 for user mode
        index = (((physicalAddress & 0o0600) >>> 3) ^ ((physicalAddress & 0o0100) >>> 2)) | ((physicalAddress >>> 1) & 0o17);
        result = insertData(CPU.mmuPAR[index] >>> 6, physicalAddress, data, byteFlag);
        if (result >= 0) {
            CPU.mmuPAR[index] = result << 6;
            CPU.mmuPDR[index] &= 0xff0f; // access impacts PDR as well
        }
        return result;
    }
};

// register kernel, super and user PDR and PAR memory management registers on i/o page

iopage.register(0o17772300, 16, mmuRegisterPDR); // Kernel 17772300 - 17772337 MMU kernel mode (0) PDR Map
iopage.register(0o17772340, 16, mmuRegisterPAR); // Kernel 17772340 - 17772377 MMU kernel mode (0) PAR Map
iopage.register(0o17772200, 16, mmuRegisterPDR); // Super 17772200 - 17772237 MMU super mode (1) PDR Map
iopage.register(0o17772240, 16, mmuRegisterPAR); // Super 17772240 - 17772277 MMU super mode (1) PAR Map
iopage.register(0o17777600, 16, mmuRegisterPDR); // User 17777600 - 17777637 MMU user mode (3) PDR Map
iopage.register(0o17777640, 16, mmuRegisterPAR); // User 17777640 - 17777677 MMU user mode (3) PAR Map

// register the 11/70 unibus mapping registers on i/o page

if (CPU_TYPE === 70) { // 11/45 doesn't have a unibus map
    iopage.register(0o17770200, 64, { // 17770200 - 17770277 Unibus Map (32 double words!)
        access: function(physicalAddress, data, byteFlag) {
            "use strict";
            var result, index = (physicalAddress >>> 2) & 0x1f; // 32 double words
            if (physicalAddress & 0o2) { // high word
                result = insertData(CPU.unibusMap[index] >>> 16, physicalAddress, data, byteFlag);
                if (result >= 0 && data >= 0) {
                    CPU.unibusMap[index] = ((result & 0x803f) << 16) | (CPU.unibusMap[index] & 0xffff);
                }
            } else { // low word
                result = insertData(CPU.unibusMap[index] & 0xffff, physicalAddress, data, byteFlag);
                if (result >= 0 && data >= 0) {
                    CPU.unibusMap[index] = (CPU.unibusMap[index] & 0x803f0000) | (result & 0xfffe);
                }
            }
            return result;
        }
    });
}

// function to map an 18 bit unibus address to a 22 bit memory address via the unibus map (if active)

function mapUnibus(unibusAddress) {
    "use strict";
    var index = (unibusAddress >>> 13) & 0x1f; // 5 top bits select mapping register
    if (index < 31) {
        if (CPU.MMR3 & 0x20) {
            unibusAddress = (CPU.unibusMap[index] + (unibusAddress & 0x1fff)) & 0x3fffff; // 13 low bits become offset
        }
    } else {
        unibusAddress |= IOBASE_22BIT; // top page always maps to unibus i/o page - apparently.
    }
    return unibusAddress;
}

// register KW11L line time clock on the i/o page

iopage.register(0o17777546, 1, (function() {
    "use strict";
    var csr, // 17777546 kw11 csr
        iMask; // interrupt mask
    function init() {
        "use strict";
        csr = 0x80; // monitor set, ie clear
        iMask = 0;
    }
    init();
    setInterval(function() {
        "use strict";
        csr |= 0x80; // set monitor
        if (csr & 0x40) { // interrupt if ie
            iMask = 1;
            requestInterrupt();
        }
    }, 20); // 50 Hz repeating (Australian power!)
    return {
        access: function(physicalAddress, data, byteFlag) {
            "use strict";
            var result;
            switch (physicalAddress & 0o6) {
                case 0o6: // 17777546 kw11 csr
                    result = insertData(csr, physicalAddress, data, byteFlag);
                    if (result >= 0 && data >= 0) {
                        if ((result ^ csr) & 0x40) { // ie change?
                            if (result & 0x40) { // setting...
                                iMask = 1;
                                requestInterrupt();
                            } else { // clearing...
                                iMask = 0;
                            }
                        }
                        csr = result & 0x40; // NOTE: monitor cleared on write (DATO)
                    }
                    return result;
                default:
                    return trap(0o4, 0x10); // Trap 4 - 0x10 Unibus time-out
            }
        },
        poll: function(takeInterrupt) {
            "use strict";
            if (iMask) {
                if (takeInterrupt) {
                    iMask = 0;
                    return 0o100; // KW11 vector
                } else {
                    if (csr & 0x40) { // interrupts still enabled?
                        return 6 << 5; // KW11 priority
                    }
                    iMask = 0;
                }
            }
            return 0;
        },
        reset: init
    };
})());

// function to register a dl11 terminal (such as the console) on the i/o page

function dl11(vt52Unit, deviceVector) {
    "use strict";
    var rcsr, // 17777560 tty rcsr receive control register 7 DONE 6 IE
        rbuf, // 17777562 tty rbuf receive buffer
        xcsr, // 17777564 tty xcsr transmit control register 7 DONE 6 IE
        xbuf, // 17777566 tty xbuf transmit buffer
        xdelay, // transmit delay (to pass diagnostics)
        iMask; // interrupt mask
    var unit = vt52Unit,
        vector = deviceVector,
        divElement;
    function init() {
        "use strict";
        rcsr = 0; // no character received
        rbuf = 0;
        xcsr = 0x80; // ready to transmit
        xbuf = 0;
        xdelay = 0;
        iMask = 0;
    }
    function dlInput(unit, ch) { // called by vt52 code when a character has been typed
        "use strict";
        if (rcsr & 0x80) { // done still set
            return 0; // so reject new character
        }
        rbuf = ch;
        rcsr |= 0x80; // set receive done
        if (rcsr & 0x40) {
            iMask |= 1; // request receive interrupt
            requestInterrupt();
        }
        return 1; // consume character
    }
    init();
    if (unit === 0) { // unit 0 has a pre-prepared html element waiting
        divElement = document.getElementById(unit);
        vt52Initialize(unit, divElement, dlInput);
    }
    return {
        access: function(physicalAddress, data, byteFlag) {
            "use strict";
            var result;
            switch (physicalAddress & 0o6) {
                case 0o0: // 17777560 tty rcsr
                    result = insertData(rcsr, physicalAddress, data, byteFlag);
                    if (result >= 0 && data >= 0) {
                        if ((result ^ rcsr) & 0x40) { // ie change?
                            if (result & 0x40) { // setting...
                                rcsr |= 0x40;
                                if (rcsr & 0x80) { // if done also set
                                    iMask |= 1; // request receive interrupt
                                    requestInterrupt();
                                }
                            } else { // clearing...
                                rcsr &= ~0x40;
                                iMask &= ~1; // clear any receive interrupts
                            }
                        }
                    }
                    break;
                case 0o2: // 17777562 tty rbuf
                    result = insertData(rbuf, physicalAddress, data, byteFlag);
                    if (result >= 0) {
                        rcsr &= ~0x80; // receive clear on read/write access
                    }
                    break;
                case 0o4: // 17777564 tty xcsr
                    result = insertData(xcsr, physicalAddress, data, byteFlag);
                    if (result >= 0) {
                        if (data >= 0) { // xcsr write
                            if ((result ^ xcsr) & 0x40) { // ie change?
                                if (result & 0x40) { // setting..
                                    if (xcsr & 0x80) { // and done bit...
                                        xcsr = 0xc0; // set ie
                                        iMask |= 2; // request transmit interrupt
                                        requestInterrupt();
                                    } else {
                                        xcsr = 0x40; // setting ie but done clear - must be a diagnostic!
                                        setTimeout(function() {
                                            xcsr |= 0x80;
                                            if ((xcsr & 0x40)) {
                                                iMask |= 2; // request transmit interrupt
                                                requestInterrupt();
                                            }
                                        }, 1);
                                    }
                                } else { // clearing...
                                    xcsr = 0x80; // clear ie and ensure done set
                                    iMask &= ~2; // clear transmit interrupt
                                }
                            }
                        } else { // xcsr read - if delay wait a couple of cycles to say done
                            if (xdelay > 0) {
                                if (--xdelay <= 0) {
                                    xcsr |= 0x80;
                                }
                            }
                        }
                    }
                    break;
                case 0o6: // 17777566 tty xbuf
                    result = insertData(xbuf, physicalAddress, data, byteFlag);
                    if (data >= 0 && result >= 0) {
                        if (divElement === undefined) { // make a html element on first character output
                            divElement = document.createElement('div');
                            divElement.innerHTML = '<p>tty' + unit + '<br /><textarea id=' + unit + ' cols=132 rows=24 style="font-family:' + "'Courier New'" + ',Courier,' + "'Lucida Console'" + ',Monaco,monospace;" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"></textarea><br /></p>';
                            document.getElementById('dl11').appendChild(divElement);
                            vt52Initialize(unit, document.getElementById(unit), dlInput);
                        }
                        xbuf = result & 0x7f; // 7 bit ascii
                        if (xbuf >= 8 && xbuf < 127) {
                            vt52Put(unit, xbuf);
                        }
                        if ((xcsr & 0x40)) { // if ie
                            iMask |= 2; // request transmit interrupt
                            requestInterrupt();
                        } else {
                            xcsr &= ~0x80; // clear ready
                            xdelay = 3; // wait for a couple of status reads before reset
                        }
                    }
                    break;
            }
            return result;
        },
        poll: function(takeInterrupt) {
            "use strict";
            if (iMask) {
                if (takeInterrupt) {
                    if (iMask & 1) {
                        iMask &= ~1;
                        return vector; // receive vector
                    } else {
                        iMask = 0;
                        return vector + 4; // transmit vector
                    }
                } else {
                    return 4 << 5; // DL11 priority
                }
            }
            return 0;
        },
        reset: init
    };
}

// register the console terminal
iopage.register(0o17777560, 4, dl11(0, 0o60));
// and another two for fun...
iopage.register(0o17776500, 4, dl11(1, 0o310));
iopage.register(0o17776510, 4, dl11(2, 0o320));
//iopage.register(0o17776520, 4, dl11(3, 0o330));
//iopage.register(0o17776530, 4, dl11(3, 0o340));

// register an LP11 line printer on the i/o page

iopage.register(0o17777510, 2, (function() {
    var lpcs, // 17777514 line printer control status
        lpdb, // 17777516 line printer data buffer
        iMask; // interrupt mask
    var lp11Element;
    function init() {
        "use strict";
        lpcs = 0x80; // done set, ie clear
        lpdb = 0;
        iMask = 0;
    }
    init();
    return {
        access: function(physicalAddress, data, byteFlag) {
            "use strict";
            var result;
            switch (physicalAddress & 0o6) {
                case 0o4: // 17777514 lpcs line printer control register
                    result = insertData(lpcs, physicalAddress, data, byteFlag);
                    if (result >= 0 && data >= 0) {
                        if ((result ^ lpcs) & 0x40) { // ie change?
                            if (result & 0x40) { // setting...
                                iMask = 1;
                                requestInterrupt();
                            } else { // clearing...
                                iMask = 0;
                            }
                        }
                        lpcs = (lpcs & 0x80) | (result & 0x40); // (we don't ever actually clear done)
                    }
                    break;
                case 0o6: // 17777516 lpdb line printer buffer
                    result = insertData(lpdb, physicalAddress, data, byteFlag);
                    if (data >= 0 && result >= 0) {
                        if (lp11Element === undefined) {
                            document.getElementById("lp11").innerHTML = '<p>printer<br /><textarea id=lp11_id cols=132 rows=24 spellcheck=false style="font-family:Liberation Mono,Monaco,Courier New,Lucida Console,Consolas,DejaVu Sans Mono,Bitstream Vera Sans Mono,monospace"></textarea><br /><button onclick="document.getElementById(' + "'lp11_id'" + ').value=' + "''" + ';">Clear</button></p>';
                            lp11Element = document.getElementById("lp11_id");
                        }
                        lpdb = result & 0x7f; // 7 bit ascii
                        if (lpdb >= 0o12 && lpdb !== 0o15) {
                            lp11Element.value += String.fromCharCode(lpdb);
                            if (lpdb == 0o12) {
                                lp11Element.scrollTop = lp11Element.scrollHeight;
                            }
                        }
                        if (lpcs & 0x40) {
                            iMask = 1;
                            requestInterrupt();
                        }
                    }
                    break;
                default:
                    return trap(0o4, 0x10); // Trap 4 - 0x10 Unibus time-out
            }
            return result;
        },
        poll: function(takeInterrupt) {
            "use strict";
            if (iMask) {
                if (takeInterrupt) {
                    iMask = 0;
                    return 0o200; // LP11 vector
                } else {
                    if (lpcs & 0x40) { // interrupts still enabled?
                        return 4 << 5; // LP11 priority
                    }
                    iMask = 0;
                }
            }
            return 0;
        },
        reset: init
    };
})());


// =========== Disk I/O support routines ===========

const
    IO_BLOCKSIZE = 1024 * 1024; // 1 Mb request size. Larger reduces number of requests but increases count


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
            //block = 0; // Note case fall thru!
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
        if (cache[block] === undefined) {
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
// the pending i/o (which may trigger additional transfers).

function getData(controlBlock, operation, position, address, count) {
    "use strict";
    if (extractXHR(controlBlock.xhr, controlBlock.cache, ~~(position / IO_BLOCKSIZE)) < 0) {
        controlBlock.callback(controlBlock, 1, position, address, count); // NXD - error callback
    } else {
        diskIO(controlBlock, operation, position, address, count); // Resume I/O
    }
}

// devices call diskIO() to do read and write functions. Reads must initially come from
// server files but re-read and write functions use local cache.

function diskIO(controlBlock, operation, position, address, count) {
    "use strict";
    var block, offset, data;
    block = ~~(position / IO_BLOCKSIZE); // Disk cache block
    if (controlBlock.cache[block] !== undefined) {
        offset = position % IO_BLOCKSIZE;
        while (count > 0) {
            switch (operation) {
                case 1: // Write: write from memory to cache
                case 3: // Check: compare memory with disk cache
                    data = readWordByPhysical((controlBlock.mapped ? mapUnibus(address) : address));
                    if (data < 0) {
                        controlBlock.callback(controlBlock, 2, block * IO_BLOCKSIZE + offset, address, count); // NXM
                        return;
                    }
                    if (operation === 1) { // write: put data into disk cache
                        controlBlock.cache[block][offset] = data & 0xff;
                        controlBlock.cache[block][offset + 1] = (data >>> 8) & 0xff;
                    } else { // check: compare memory with disk cache
                        if (data !== ((controlBlock.cache[block][offset + 1] << 8) | controlBlock.cache[block][offset])) {
                            controlBlock.callback(controlBlock, 3, block * IO_BLOCKSIZE + offset, address, count); // mismatch
                            return;
                        }
                    }
                    address += 2;
                    count -= 2; // bytes to go.... (currently all write operations are whole offsets)
                    offset += 2;
                    break;
                case 2: // Read: read to memory from cache
                    data = (controlBlock.cache[block][offset + 1] << 8) | controlBlock.cache[block][offset];
                    if (count > 1) { // tape can read odd number of bytes - of course it can. :-(
                        if (writeWordByPhysical((controlBlock.mapped ? mapUnibus(address) : address), data) < 0) {
                            controlBlock.callback(controlBlock, 2, block * IO_BLOCKSIZE + offset, address, count); // NXM
                            return;
                        }
                        address += 2;
                        count -= 2; // bytes to go....
                    } else {
                        if (writeByteByPhysical((controlBlock.mapped ? mapUnibus(address) : address), data & 0xff) < 0) {
                            controlBlock.callback(controlBlock, 2, block * IO_BLOCKSIZE + offset, address, count); // NXM
                            return;
                        }
                        address += 1;
                        --count; // bytes to go....
                    }
                    offset += 2;
                    break;
                case 4: // accumulate a record count into the address field for tape operations
                    data = (controlBlock.cache[block][offset + 1] << 8) | controlBlock.cache[block][offset];
                    address = (data << 16) | (address >>> 16);
                    count -= 2; // bytes to go....
                    offset += 2;
                    break;
                case 5: // read one lousy byte (for PTR) - result also into address field!!!!
                    address = controlBlock.cache[block][offset++];
                    count = 0; // force end!
                    break;
                default:
                    panic(); // invalid operation - how did we get here?
            }
            if (offset >= IO_BLOCKSIZE) {
                offset = 0;
                block++;
                if (controlBlock.cache[block] === undefined) {
                    break;
                }
            }
        }
        position = block * IO_BLOCKSIZE + offset;
    }
    if (count > 0) { // I/O not complete so we need to get some data
        if (controlBlock.xhr === undefined) {
            controlBlock.xhr = new XMLHttpRequest();
        }
        controlBlock.xhr.open("GET", controlBlock.url, true);
        controlBlock.xhr.responseType = "arraybuffer";
        controlBlock.xhr.onreadystatechange = function() {
            if (controlBlock.xhr.readyState === controlBlock.xhr.DONE) {
                getData(controlBlock, operation, position, address, count);
            }
        };
        block = ~~(position / IO_BLOCKSIZE);
        controlBlock.xhr.setRequestHeader("Range", "bytes=" + (block * IO_BLOCKSIZE) + "-" + ((block + 1) * IO_BLOCKSIZE - 1));
        controlBlock.xhr.send(null);
        return;
    }
    controlBlock.callback(controlBlock, 0, position, address, count); // success callback
}

// register the paper tape reader on the i/o page

iopage.register(0o17777550, 2, (function() {
    var ptrcs, // 17777550 // paper tape reader control register 15 ERR 11 BUSY 7 DONE 6 IE 0 GO
        ptrdb, // 17777552 // paper tape reader data buffer
        ptrName, // paper tape file name
        iMask; // interrupt mask
    var ptControlblock;
    function init() {
        "use strict";
        ptrcs = 0;
        ptrdb = 0;
        iMask = 0;
        document.getElementById("ptr").onchange = selectPaperTape;
    }
    function selectPaperTape() {
        ptrName = document.getElementById("ptr").value;
        ptrcs = 0; // clear status when tape selected
        if (ptControlblock !== undefined) {
            ptControlblock = undefined; // Forget any existing details
        }
    }
    function ptCallback(controlBlock, code, position, address, count) {
        "use strict";
        controlBlock.position = position;
        ptrdb = address & 0xff; // diskIO function 5 stores a byte in address
        if (code !== 0) {
            ptrcs |= 0x8000; // set ERROR
        }
        if (ptrcs & 0x40) { // if ie...
            iMask = 1;
            requestInterrupt();
        }
        ptrcs = (ptrcs | 0x80) & ~0x800; // set DONE clear BUSY
    }
    init();
    return {
        access: function(physicalAddress, data, byteFlag) {
            "use strict";
            var result;
            switch (physicalAddress & 0o6) {
                case 0o0: // 17777550 ptrcs paper tape reader control register
                    result = insertData(ptrcs, physicalAddress, data, byteFlag);
                    if (result >= 0 && data >= 0) {
                        if ((result ^ ptrcs) & 0x40) { // ie change?
                            if (result & 0x40) { // setting...
                                iMask = 1;
                                requestInterrupt();
                            } else { // clearing...
                                iMask = 0;
                            }
                        }
                        ptrcs = (ptrcs & ~0x41) | (result & 0x41); // only update ie and go
                        if ((ptrcs & 0x8801) == 0x1) { // if not ERROR or BUSY and GO set...
                            if (ptrName === "") {
                                ptrcs = (ptrcs & ~0x1) | 0x8000; // clear GO and set ERROR if no tape
                            } else {
                                if (ptControlblock === undefined) {
                                    ptControlblock = {
                                        "cache": [],
                                        "callback": ptCallback,
                                        "mapped": 1,
                                        "url": ptrName,
                                        "position": 0
                                    };
                                }
                                ptrcs = (ptrcs & ~0x1) | 0x800; // clear GO and set BUSY
                                diskIO(ptControlblock, 5, ptControlblock.position, 0o17777552, 1); // read a byte!
                            }
                        }
                    }
                    break;
                case 0o2: // 17777552 ptrdb paper tape reader data buffer
                    result = insertData(ptrdb, physicalAddress, data, byteFlag);
                    if (result >= 0) {
                        ptrcs = ptrcs & ~0x80; // clear DONE
                    }
                    break;
                default:
                    return trap(0o4, 0x10); // Trap 4 - 0x10 Unibus time-out
            }
            return result;
        },
        poll: function(takeInterrupt) {
            "use strict";
            if (iMask) {
                if (takeInterrupt) {
                    iMask = 0;
                    return 0o070; // PTR11 vector
                } else {
                    if (ptrcs & 0x40) { // interrupts still enabled?
                        return 4 << 5; // PTR11 priority
                    }
                    iMask = 0;
                }
            }
            return 0;
        },
        reset: init
    };
})());

// register a TM11 tape controller on the i/o page

iopage.register(0o17772520, 6, (function() {
    "use strict";
    const MAXDRIVE = 3;
    var mts, //   17772520 mts Status Register 15 ILC 14 EOF 10 EOT 8 RLE 6 SEL 5 BOT 2 WRL 1 REW 0 RDY
        mtc, //   17772522 mtc Command Register 15 ERR 12 14-13 den 10-8 unit INI 7 RDY 6 IE 3-1 fun 0 GO
        mtbrc, // 17772524 mtbrc Byte Record Counter
        mtcma, // 17772526 mtcma Current Memory Address Register
     // mtd,      17772530 mtd Data Buffer Register
        mtrd, //  17772532 mtrd TU10 Read Lines
        iMask; // drive interrupt mask
    var mtControlBlock = []; // i/o control block - contains url, cache and other bits for each drive
    function init() { // RESET MUST NOT RE-POSITION TAPE!
        "use strict";
        mts = 0x65; //   6 sel 5 bot 2 wrl 0 tur
        mtc = 0x6080; // 14-13 bpi 7 cu rdy
        mtbrc = 0;
        mtcma = 0;
        mtrd = 0;
        iMask = 0;
    }
    function mtCallback(controlBlock, code, position, address, count) {
        "use strict";
        if (code === 0 && controlBlock.command > 0) {
            if (address === 0 || address > 0x80000000) { // tape mark
                controlBlock.position = (position + 1) & ~1;
                mtc |= 0x8000; // set mtc err bit
                mts |= 0x4000; // set EOF bit
            } else {
                switch (controlBlock.command) {
                    case 1: // read
                        controlBlock.position = (position + 4 + address + 1) & ~1;
                        controlBlock.command = 0;
                        count = (0x10000 - mtbrc) & 0xffff;
                        if (count >= address || count === 0) {
                            count = address;
                            mtbrc = (mtbrc + count) & 0xffff;
                        } else {
                            mts |= 0x200; // RLE
                            mtbrc = 0;
                        }
                        address = ((mtc & 0x30) << 12) | mtcma;
                        diskIO(controlBlock, 2, position, address, count);
                        return;
                    case 4: // space forward
                        position = (position + 4 + address + 1) & ~1;
                        controlBlock.position = position;
                        mtbrc = (mtbrc + 1) & 0xffff;
                        if (mtbrc) {
                            diskIO(controlBlock, 4, position, 0, 4);
                            return;
                        }
                        break;
                    case 5: // space reverse
                        position = (position - 8 - address + 1) & ~1;
                        controlBlock.position = position;
                        mtbrc = (mtbrc + 1) & 0xffff;
                        if (mtbrc) {
                            if (position > 0) {
                                diskIO(controlBlock, 4, position - 4, 0, 4);
                                return;
                            }
                        }
                        break;
                    default:
                        panic();
                }
            }
        }
        if (controlBlock.command === 0) {
            mtbrc = (mtbrc - count) & 0xffff;
            mtcma = address & 0xffff;
            mtc = (mtc & ~0x30) | ((address >>> 12) & 0x30);
        }
        switch (code) {
            case 1: // read error
                mts |= 0x100; // Bad tape error
                break;
            case 2: // NXM
                mts |= 0x80; // NXM
                break;
        }
        if (mtc & 0x40) { // if ie...
            iMask |= 1; // request end of i/o interrupt
            requestInterrupt();
        }
        mts |= 1; // tape unit ready
        mtc |= 0x80; // command complete
    }
    function go() { // execute command loaded into mtc register
        "use strict";
        var drive = (mtc >>> 8) & 3;
        mtc &= ~0x8081; // clear mtc error bits, ready and go
        mts &= ~0xff80; // clear mts error bits
        if (drive > MAXDRIVE) {
            mtc |= 0x8000; // set mtc err bit
            mts |= 0x8000; // set mts err bit
            mts &= ~0x41; // clear select and ready
        } else {
            mts |= 0x40; // set drive select
            if (mtControlBlock[drive] === undefined) {
                mtControlBlock[drive] = {
                    "cache": [],
                    "callback": mtCallback,
                    "mapped": 1,
                    "url": "tm" + drive + ".tap",
                    "drive": drive,
                    "position": 0,
                    "command": 0
                };
            }
            mtControlBlock[drive].command = (mtc >>> 1) & 7; // store command number for callback
            switch (mtControlBlock[drive].command) { // function code
                case 0: // off-line
                    break;
                case 1: // read - do i/o to get next record size
                    diskIO(mtControlBlock[drive], 4, mtControlBlock[drive].position, 0, 4);
                    return;
                case 2: // write
                case 3: // write end of file
                case 6: // write with extended IRG
                    mtc |= 0x8000; // set mtc err bit
                    mts |= 0x8040; // set mts err bit (plus write locked for good measure)
                    break;
                case 4: // space forward - get next record size
                    diskIO(mtControlBlock[drive], 4, mtControlBlock[drive].position, 0, 4);
                    return;
                case 5: // space reverse
                    if (mtControlBlock[drive].position > 0) { // get previous record size
                        diskIO(mtControlBlock[drive], 4, mtControlBlock[drive].position - 4, 0, 4);
                        return;
                    }
                    break;
                case 7: // rewind - easy just position at start
                    if (mtControlBlock[drive].position !== 0) {
                        mtControlBlock[drive].position = 0;
                        if (mtc & 0x40) { // if ie...
                            iMask |= 2; // request rewind interrupt
                        }
                    }
                    mts &= ~0x1; // clear RWS (maybe we should actually use it?)
                    mts |= 0x21; // set BOT and RDY
                    break;
                default:
                    break;
            }
        }
        if (mtc & 0x40) { // if ie...
            iMask |= 1; // request command end interrupt
            requestInterrupt();
        }
        mtc |= 0x80; // command complete
    }
    init();
    return {
        access: function(physicalAddress, data, byteFlag) {
            "use strict";
            var result;
            switch (physicalAddress & 0o16) {
                case 0o00: // 17772520 mts Status Register
                    mts &= ~0x20; // clear BOT
                    if (mtControlBlock[(mtc >>> 8) & 3] !== undefined) {
                        if (mtControlBlock[(mtc >>> 8) & 3].position === 0) {
                            mts |= 0x20; // turn on BOT
                        }
                    }
                    result = mts;
                    break;
                case 0o02: // 17772522 mtc Control Register
                    result = insertData(mtc, physicalAddress, data, byteFlag);
                    if (result >= 0 && data >= 0) {
                        if (result & 0x1000) { //init
                            init();
                        } else {
                            if ((result ^ mtc) & 0x40) { // ie change?
                                if (result & 0x40) { // setting...
                                    if ((mtc & 0x80) && !(result & 0x01)) { // if ready but not go then interrupt
                                        iMask |= 1; // interrupt
                                        requestInterrupt();
                                    }
                                } else { // clearing...
                                    iMask = 0;
                                }
                            }
                            mtc = (mtc & 0x80) | (result & 0x7f7f); // keep what we need
                            if ((mtc & 0x81) === 0x81) { // If done & go then start something..
                                go();
                            }
                        }
                    }
                    break;
                case 0o04: // 17772524 mtbrc Byte Counter
                    result = insertData(mtbrc, physicalAddress, data, byteFlag);
                    if (result >= 0) {
                        mtbrc = result;
                    }
                    break;
                case 0o06: // 17772526 mtcma Memory Address Register
                    result = insertData(mtcma, physicalAddress, data, byteFlag);
                    if (result >= 0) {
                        mtcma = result;
                    }
                    break;
                case 0o10: // 17772530 mtd Data Buffer
                case 0o12: // 17772532 mtrd Read Lines
                    mtrd ^= 0x80ff; // RSTS uses this for some sort of timing
                    result = mtrd;
                    break;
                default:
                    return trap(0o4, 0x10); // Trap 4 - 0x10 Unibus time-out
            }
            return result;
        },
        poll: function(takeInterrupt) {
            "use strict";
            if (iMask) {
                if (takeInterrupt) {
                    if (iMask & 1) { // command or i/o interrupt
                        iMask &= ~1;
                    } else { // rewind interrupt
                        iMask = 0;
                    }
                    return 0o224; // TM11 vector
                } else {
                    if (mtc & 0x40) { // interrupts still enabled?
                        return 5 << 5; // TM11 priority
                    }
                    iMask = 0;
                }
            }
            return 0;
        },
        reset: init
    };
})());

// register an RK11 disk controller on the i/o page

iopage.register(0o17777400, 8, (function() {
    "use strict";
    const TRACKS = [406, 406, 406, 406, 406, 406, 406, 0];
    var
        rkds, // 17777400 Drive Status 15-13 ID 11 RK05 8 SOK 7 DRY 6 RDY 3-0 SECT (should be per disk)
        rker, // 17777402 Error Register
        rkcs, // 17777404 Control Status 15 ERR 13 SCP 7 RDY 6 IE 5-4 MEX 3-1 FUN 0 GO
        rkwc, // 17777406 Word Count
        rkba, // 17777410 Bus Address
        rkda, // 17777412 Disk Address
        //unused 17777414 unused
        // rkdb, 17777416 Data buffer
        iMask; // drive interrupt mask
    var rkControlBlock = []; // i/o control block - contains url, cache and other bits for drive
    function init() {
        "use strict";
        rkds = 0o4700; // set RK05 SOK DRY RDY
        rker = 0;
        rkcs = 0o200; // set RDY
        rkwc = 0;
        rkba = 0;
        rkda = 0;
        iMask = 0;
    }
    function rkCallback(controlBlock, code, position, address, count) {
        "use strict";
        rkba = address & 0xffff;
        rkcs = (rkcs & ~0x30) | ((address >>> 12) & 0x30);
        rkwc = (0x10000 - (count >>> 1)) & 0xffff;
        position = ~~(position / 512);
        rkda = (rkda & 0xe000) | ((~~(position / 12)) << 4) | (position % 12);
        switch (code) {
            case 0: // mo error
                rkcs |= 0x80;
                break;
            case 1: // read error
                rker |= 0x8100; // Report TE (Timing error)
                rkcs |= 0xc000;
                if (rker & 0x7fc0) rkcs |= 0x4000;
                break;
            case 2: // NXM
                rker |= 0x8400; // NXM
                rkcs |= 0xc000;
                break;
            case 3: // compare error
                rker |= 0x8001; // Report TE (Write check error)
                rkcs |= 0x8000;
                break;
        }
        if (rkcs & 0x40) { // if ie...
            iMask |= 0x100; // command complete
            requestInterrupt();
        }
        rkds = (controlBlock.drive << 13) | (rkds & 0x1ff0); // Insert drive into status
        rkcs |= 0x80; // command complete
    }
    function go() { // execute command loaded into rkcs register
        "use strict";
        var sector, address, count;
        var drive = (rkda >>> 13) & 7;
        rkcs &= ~0x2081; // clear search, done & go bits
        rker &= ~0x03; // clear soft errors
        switch ((rkcs & 0xe) >>> 1) { // Action depends on function code
            case 0: // controller reset
                for (drive = 0; drive < 8; drive++) {
                    if (rkControlBlock[drive] !== undefined) {
                        if (rkControlBlock[drive].xhr !== undefined) {
                            rkControlBlock[drive].xhr.abort();
                        }
                    }
                }
                init();
                break;
            case 1: // write
            case 2: // read
            case 3: // check
                if (TRACKS[drive] === 0) {
                    rker |= 0x8080; // NXD non-existant drive
                    break;
                }
                if (((rkda >>> 4) & 0x1ff) >= TRACKS[drive]) {
                    rker |= 0x8040; // NXC non-existant cylinder
                    break;
                }
                if ((rkda & 0xf) >= 12) {
                    rker |= 0x8020; // NXS non-existant sector
                    break;
                }
                if (rkControlBlock[drive] === undefined) {
                    rkControlBlock[drive] = {
                        "cache": [],
                        "callback": rkCallback,
                        "mapped": 1,
                        "url": "rk" + drive + ".dsk",
                        "drive": drive
                    };
                }
                sector = (((rkda >>> 4) & 0x1ff) * 12 + (rkda & 0xf));
                address = ((rkcs & 0x30) << 12) | rkba;
                count = (0x10000 - rkwc) & 0xffff;
                diskIO(rkControlBlock[drive], (rkcs >>> 1) & 7, sector * 512, address, count << 1);
                return;
            case 6: // Drive Reset - falls through to finish as a seek
                rker = 0; //
                rkda &= 0xe000; // keep drive number and fall thru
            case 4: // Seek (and drive reset) - complete immediately
                if (rkcs & 0x40) { // if ie...
                    iMask |= 0x100 | (1 << drive); // command interrupt AND later a seek interrupt
                    requestInterrupt();
                } else {
                    rkds = (drive << 13) | (rkds & 0x1ff0); // Insert drive into status
                    rkcs |= 0x2000; // Set read/write/search complete
                }
                rkcs |= 0x80; // command complete
                return;
            default: // Read Check & write lock not implemented
                break;
        }
        if (rkcs & 0x40) { // if ie...
            iMask |= 0x100; // command interrupt
            requestInterrupt();
        }
        rkds = (drive << 13) | (rkds & 0x1ff0); // Insert drive into status
        rkcs |= 0x80; // command complete
    }
    init();
    return {
        access: function(physicalAddress, data, byteFlag) {
            "use strict";
            var result;
            switch (physicalAddress & 0o16) {
                case 0o00: // 17777400 rkds (read only)
                    result = insertData(rkds, physicalAddress, data, byteFlag);
                    break;
                case 0o02: // 17777402 rker (read only)
                    result = insertData(rker, physicalAddress, data, byteFlag);
                    break;
                case 0o04: // 17777404 rkcs
                    result = insertData(rkcs, physicalAddress, data, byteFlag);
                    if (result >= 0 && data >= 0) {
                        rkcs = (result & ~0xf080) | (rkcs & 0xf080); // Bits 7, 12 - 15 are read only
                        if (!(rkcs & 0x40)) { // if ie clear...
                            iMask = 0;
                        }
                        if ((rkcs & 0x81) === 0x81) { // if done & go then start something..
                            go();
                        }
                    }
                    break;
                case 0o06: // 17777406 rkwc
                    result = insertData(rkwc, physicalAddress, data, byteFlag);
                    if (result >= 0) {
                        rkwc = result;
                    }
                    break;
                case 0o10: // 17777410 rkba
                    result = insertData(rkba, physicalAddress, data, byteFlag);
                    if (result >= 0) {
                        rkba = result & 0xfffe;
                    }
                    break;
                case 0o12: // 17777412 rkda
                    result = insertData(rkda, physicalAddress, data, byteFlag);
                    if (result >= 0) {
                        rkda = result;
                    }
                    break;
                case 0o14: // 17777414 unused
                case 0o16: // 17777416 rkdb (who cares)
                    result = 0;
                    break;
            }
            return result;
        },
        poll: function(takeInterrupt) {
            "use strict";
            if (iMask) {
                if (takeInterrupt) {
                    if (iMask & 0x100) { // command interrupt?
                        iMask &= ~0x100; // command complete
                    } else {
                        for (let drive = 0; drive < 8; drive++) { // find drive which finished seek
                            if (iMask & (1 << drive)) {
                                rkcs |= 0x2000; // set read/write/search complete
                                rkds = (drive << 13) | (rkds & 0x1ff0); // insert drive into status
                                iMask &= ~(1 << drive); // seek complete
                                break;
                            }
                        }
                    }
                    return 0o220; // RK11 vector
                } else {
                    if (rkcs & 0x40) { // interrupts still enabled?
                        return 5 << 5; // RK11 priority
                    }
                    iMask = 0;
                }
            }
            return 0;
        },
        reset: init
    };
})());


// register an RL11 disk controller on the i/o page

iopage.register(0o17774400, 4, (function() {
    "use strict";
    const SECTORS = [40, 40, 40, 40]; // sectors per track
    const TRACKS = [1024, 1024, 512, 512]; // First two drives RL02 - last two RL01 - cylinders * 2
    const STATUS = [0o235, 0o235, 0o35, 0o35]; // First two drives RL02 - last two RL01
    var
        csr, // 17774400 Control status register 15-13 ERR 9-8 drive 7 RDY 6 IE 5-4 MEX 3-1 FUN 0 DRDY
        bar, // 17774402 Bus address
        dar, // 17774404 Disk address
        mpr, // 17774406 Multi purpose register
        DAR, // internal disk address
        iMask; // drive interrupt mask
    var rlControlBlock = []; // i/o control block - contains url, cache and other bits for drive
    function init() {
        "use strict";
        csr = 0x81; // 15 ERR 14 DE 13-10 err 8-9 drive 6 IE 5-4 BA 3-1 fun 0 RDY
        bar = 0;
        dar = 0;
        mpr = 0;
        DAR = 0;
        iMask = 0;
    }
    function rlCallback(controlBlock, code, position, address, count) {
        "use strict";
        var sector = ~~(position / 256);
        bar = address & 0xffff;
        csr = (csr & ~0x30) | ((address >>> 12) & 0x30);
        dar = ((~~(sector / SECTORS[controlBlock.drive])) << 6) | (sector % SECTORS[controlBlock.drive]);
        DAR = dar;
        mpr = (0x10000 - (count >>> 1)) & 0xffff;
        switch (code) {
            case 1: // read error
                csr |= 0x8400; // Report operation incomplete
                break;
            case 2: // NXM
                csr |= 0xa000; // NXM
                break;
        }
        if (csr & 0x40) { // if ie...
            iMask = 1; // end of i/o interrupt
            requestInterrupt();
        }
        csr |= 0x81; // set ready & drive ready
    }
    function go() { // execute command loaded into csr register
        "use strict";
        var sector, address, count;
        var drive = (csr >>> 8) & 3;
        csr &= ~0x1; // clear drive ready
        if (rlControlBlock[drive] === undefined) {
            rlControlBlock[drive] = {
                "cache": [],
                "callback": rlCallback,
                "mapped": 1,
                "url": "rl" + drive + ".dsk",
                "drive": drive
            };
        }
        switch ((csr >>> 1) & 7) { // function code
            case 0: // no op
                break;
            case 1: // write check
                break;
            case 2: // get status
                if (mpr & 8) csr &= 0x3f;
                mpr = STATUS[drive] | (DAR & 0o100); // bit 6 Head Select bit 7 Drive Type 1=rl02
                break;
            case 3: // seek
                if ((dar & 3) === 1) {
                    if (dar & 4) {
                        DAR = ((DAR + (dar & 0xff80)) & 0xff80) | ((dar << 2) & 0x40);
                    } else {
                        DAR = ((DAR - (dar & 0xff80)) & 0xff80) | ((dar << 2) & 0x40);
                    }
                    dar = DAR;
                }
                break;
            case 4: // read header
                mpr = DAR;
                break;
            case 5: // write
                if ((dar >>> 6) >= TRACKS[drive]) {
                    csr |= 0x9400; // HNF
                    break;
                }
                if ((dar & 0x3f) >= SECTORS[drive]) {
                    csr |= 0x9400; // HNF
                    break;
                }
                sector = ((dar >>> 6) * SECTORS[drive]) + (dar & 0x3f);
                address = bar | ((csr & 0x30) << 12);
                count = (0x10000 - mpr) & 0xffff;
                diskIO(rlControlBlock[drive], 1, sector * 256, address, count << 1);
                return;
            case 6: // read
            case 7: // Read data without header check
                if ((dar >>> 6) >= TRACKS[drive]) {
                    csr |= 0x9400; // HNF
                    break;
                }
                if ((dar & 0x3f) >= SECTORS[drive]) {
                    csr |= 0x9400; // HNF
                    break;
                }
                sector = ((dar >>> 6) * SECTORS[drive]) + (dar & 0x3f);
                address = ((csr & 0x30) << 12) | bar;
                count = (0x10000 - mpr) & 0xffff;
                diskIO(rlControlBlock[drive], 2, sector * 256, address, count << 1);
                return;
        }
        if (csr & 0x40) { // if ie...
            iMask = 1; // command interrupt
            requestInterrupt();
        }
        csr |= 0x81; // command complete
    }
    init();
    return {
        access: function(physicalAddress, data, byteFlag) {
            "use strict";
            var result;
            switch (physicalAddress & 0o6) {
                case 0o0: // 17774400 csr Control status register
                    result = insertData(csr, physicalAddress, data, byteFlag);
                    if (result >= 0 && data >= 0) {
                        if ((result ^ csr) & 0x40) { // ie change?
                            if (result & 0x40) { // setting...
                                if ((result & 0x8e) == 0x80) { // CRDY but no command (or noop)
                                    iMask |= 1; // interrupt
                                    requestInterrupt();
                                }
                            } else { // clearing...
                                iMask = 0;
                            }
                        }
                        csr = (csr & 0xfc01) | (result & 0x03fe); // keep what is needed
                        if ((csr & 1) && (csr & 0x0e)) { // commands valid for any drive with DRY
                            go();
                        }
                    }
                    break;
                case 0o2: // 17774402 bar Bus address
                    result = insertData(bar, physicalAddress, data, byteFlag);
                    if (result >= 0) {
                        bar = result & 0xfffe;
                    }
                    break;
                case 0o4: // 17774404 dar Disk address
                    result = insertData(dar, physicalAddress, data, byteFlag);
                    if (result >= 0) {
                        dar = result;
                    }
                    break;
                case 0o6: // 17774406 mpr Multi purpose register
                    result = insertData(mpr, physicalAddress, data, byteFlag);
                    if (result >= 0) {
                        mpr = result;
                    }
                    break;
            }
            return result;
        },
        poll: function(takeInterrupt) {
            "use strict";
            if (iMask) {
                if (takeInterrupt) {
                    iMask = 0;
                    return 0o160; // RL11 vector
                } else {
                    if (csr & 0x40) { // interrupts still enabled?
                        return 5 << 5; // RL11 priority
                    }
                    iMask = 0;
                }
            }
            return 0;
        },
        reset: init
    };
})());

// register an RP11 disk controller on the i/o page

iopage.register(0o17776700, 20, (function() {
    "use strict";
    const DTYPE = [0o20022, 0o20022, 0o20020, 0o20020, 0o20020, 0, 0, 0]; // Type rp06, rp06, rp04, rp04...
    const SECTORS = [22, 22, 22, 22, 22, 22, 22, 50]; // sectors per track
    const SURFACES = [19, 19, 19, 19, 19, 19, 19, 32];
    const CYLINDERS = [815, 815, 815, 815, 815, 411, 815, 630];
    var
        rpcs1, // 17776700  rpcs1 Control status 1
        rpwc, //  17776702  rpwc  Word count
        rpba, //  17776704  rpba  Memory address
        rpda, //  17776706* rpda  Disk address
        rpcs2, // 17776710  rpcs2 Control status 2
        rpds, //  17776712* rpds  Drive status (read only)
        // rper1, 17776714* rper1 Error 1
        // rpas,  17776716  rpas  Attention summary
        // rpla,  17776720* rpla  Look ahead
        // rpdb,  17776722* rpdb  Data buffer
        // rpmr,  17776724* rpmr  Maintenance
        // rpdt,  17776726* rpdt  Drive type (read only)
        // rpsn,  17776730* rpsn  Serial number (read only)
        // rpof,  17776732* rpof  Offset register
        rpdc, //  17776734* rpdc  Desired cylinder
        // rpcc,  17776736* rpcc  Current cylinder (read only)
        // rper2, 17776740* rper2 Error 2
        // rper3, 17776742* rper3 Error 3
        // rpec1, 17776744* rpec1 Error correction 1 (read only)
        // rpec2, 17776746* rpec2 Error correction 2 (read only)
        iMask; // drive interrupt mask
    var rpControlBlock = []; // i/o control block - contains url, cache and other bits for drive
    function init() {
        "use strict";
        rpcs1 = 0x880; // 15 SC 14 TRE 11 DVA 7 RDY 6 IE 5-1 FUN 0 GO
        rpwc = 0;
        rpba = 0;
        rpda = [0, 0, 0, 0, 0, 0, 0, 0];
        rpcs2 = 0;
        rpds = [0x1180, 0x1180, 0x1180, 0x1180, 0x1180, 0, 0, 0]; // 12 MOL 8 DPR 7 DRY
        rpdc = [0, 0, 0, 0, 0, 0, 0, 0];
        iMask = 0;
    }
    function rpCallback(controlBlock, code, position, address, count) {
        "use strict";
        var sector, block = ~~((position + 511) / 512);
        rpcs1 = (rpcs1 & 0xfcff) | ((address >>> 8) & 0x300);
        rpba = address & 0xfffe;
        rpwc = (0x10000 - (count >>> 1)) & 0xffff;
        sector = ~~(block / SECTORS[controlBlock.drive]);
        rpda[controlBlock.drive] = ((sector % SURFACES[controlBlock.drive]) << 8) | (block % SECTORS[controlBlock.drive]);
        rpdc[controlBlock.drive] = ~~(sector / SURFACES[controlBlock.drive]);
        if (block >= controlBlock.maxblock) {
            rpds[controlBlock.drive] |= 0x400; // LST
        }
        if (code) {
            rpds[controlBlock.drive] |= 0x8000; //ATA
            rpcs1 |= 0xc000; // set SC & TRE
            switch (code) {
                case 1: // read error
                    rpcs2 |= 0x200; // MXF Missed transfer
                    break;
                case 2: // NXM
                    rpcs2 |= 0x800; // NEM (NXM)
                    break;
            }
        }
        if (rpcs1 & 0x40) { // if ie...
            iMask |= 0x100; // data transfer interrupt
            requestInterrupt();
        }
        rpds[controlBlock.drive] |= 0x80; // set DRY
        rpcs1 |= 0x80; // set controller ready
    }
    function go() { // execute command loaded into rpcs1 register
        "use strict";
        var address, sector, drive = rpcs2 & 7;
        rpcs1 &= ~0x1; // clear go
        if (DTYPE[drive] == 0) { // is drive present?
            rpcs2 |= 0x1000; // NED (12) non-existant drive
            rpcs1 |= 0xc000; // SC (15) + TRE (14)
        } else {
            rpds[drive] &= 0x7fff; // clear drive ATA bit
            if (rpControlBlock[drive] === undefined) {
                rpControlBlock[drive] = {
                    "cache": [],
                    "callback": rpCallback,
                    "mapped": 1,
                    "url": "rp" + drive + ".dsk",
                    "drive": drive
                };
            }
            switch (rpcs1 & 0x3e) { // function code
                case 0o0: // no operation
                    return;
                case 0o2: // unload
                    break;
                case 0o4: // seek
                    break;
                case 0o6: // recalibrate
                    break;
                case 0o10: // init
                    rpds[drive] = 0x11c0;
                    rpcs1 &= ~0x703f; // clear error bits
                    rpda[drive] = 0;
                    rpdc[drive] = 0;
                    return;
                case 0o12: // release
                    return;
                case 0o14: // offset
                    break;
                case 0o16: // return to centreline
                    break;
                case 0o20: // read in preset
                    // Read-in Preset - Sets the VV (volume valid) bit, clears the Desired Sector/Track Address register, clears the Desired Cylinder Address register, and clears the FMT, HCI, and ECI bits in the Offset register. Clearing the FMT bit causes the RP04 to be in IS-bit mode.
                    rpdc[drive] = rpda[drive] = 0;
                    rpds[drive] = 0x11c0; // |= 0x40; // set VV
                    return;
                case 0o22: // pack ack
                    rpds[drive] |= 0x40; // set VV
                    return;
                case 0o30: // search
                    break;
                case 0o60: // write
                    if (!(rpds[drive] & 0x80)) { // drive not ready?
                        rpcs2 |= 0x0400; // PGE (10) program error
                        rpcs1 |= 0xc000; // SC (15) + TRE (14)
                    } else {
                        if (rpdc[drive] >= CYLINDERS[drive] || (rpda[drive] >>> 8) >= SURFACES[drive] ||
                            (rpda[drive] & 0xff) >= SECTORS[drive]) {
                            rpcs1 |= 0xc000; // set SC & TRE
                            break;
                        }
                        rpcs1 &= ~0x7081; // clear errors, TRE (14) RDY (7) and GO (0)
                        rpcs2 &= 0x7; // clear DLT (15) WCE (14) UPE (13) NED (12) NXM (11) PGE (10) MXF (9) MDPE (8)
                        rpds[drive] &= ~0x480; // clear LST & DRY
                        address = ((rpcs1 & 0x300) << 8) | (rpba & 0xfffe);
                        sector = (rpdc[drive] * SURFACES[drive] + (rpda[drive] >>> 8)) * SECTORS[drive] + (rpda[drive] & 0xff);
                        diskIO(rpControlBlock[drive], 1, sector * 512, address, ((0x10000 - rpwc) & 0xffff) << 1);
                        return;
                    }
                    break;
                case 0o70: // read
                    if (!(rpds[drive] & 0x80)) { // drive not ready?
                        rpcs2 |= 0x0400; // PGE (10) program error
                        rpcs1 |= 0xc000; // SC (15) + TRE (14)
                    } else {
                        if (rpdc[drive] >= CYLINDERS[drive] || (rpda[drive] >>> 8) >= SURFACES[drive] ||
                            (rpda[drive] & 0xff) >= SECTORS[drive]) {
                            rpcs1 |= 0xc000; // set SC & TRE
                            break;
                        }
                        rpcs1 &= ~0x7081; // clear errors, TRE (14) RDY (7) and GO (0)
                        rpcs2 &= 0x7; // clear DLT (15) WCE (14) UPE (13) NED (12) NXM (11) PGE (10) MXF (9) MDPE (8)
                        rpds[drive] &= ~0x480; // clear LST & DRY
                        address = ((rpcs1 & 0x300) << 8) | (rpba & 0xfffe);
                        sector = (rpdc[drive] * SURFACES[drive] + (rpda[drive] >>> 8)) * SECTORS[drive] + (rpda[drive] & 0xff);
                        diskIO(rpControlBlock[drive], 2, sector * 512, address, ((0x10000 - rpwc) & 0xffff) << 1);
                        return;
                    }
                    break;
                default:
                    rpcs2 |= 0x0400; // PGE (10) program error
                    rpcs1 |= 0xc000; // SC (15) + TRE (14)
                    return;
            }
        }
        if (rpcs1 & 0x40) { // if ie...
            iMask |= 1 << drive; // non data transfer interrupt
            requestInterrupt();
        }
        rpds[drive] |= 0x8000; // set drive ATA attention
    }
    init();
    return {
        access: function(physicalAddress, data, byteFlag) {
            "use strict";
            var result;
            switch (physicalAddress & 0o76) {
                case 0o00: // 17776700 rpcs1 Control status 1
                    result = insertData(rpcs1, physicalAddress, data, byteFlag);
                    if (result >= 0 && data >= 0) {
                        if ((result & 0xd0) == 0xc0) { // ready and ie set but not go (unusual behaviour here)
                            iMask |= 1; // interrupt
                            requestInterrupt();
                        } else {
                            if (!(result & 0x40)) { // clearing ie
                                iMask = 0;
                            }
                        }
                        rpcs1 = (rpcs1 & 0x8880) | (result & 0x477f); // keep what is needed
                        if (rpcs1 & 0x01) { // commands valid for any drive with DRY
                            go();
                        }
                    }
                    break;
                case 0o02: // 17776702 rpwc  Word count
                    result = insertData(rpwc, physicalAddress, data, byteFlag);
                    if (result >= 0) {
                        rpwc = result;
                    }
                    break;
                case 0o04: // 17776704 rpba  Memory address
                    result = insertData(rpba, physicalAddress, data, byteFlag);
                    if (result >= 0) {
                        rpba = result & 0xfffe;
                    }
                    break;
                case 0o06: // 17776706 rpda  Disk address (in DRIVE)
                    result = insertData(rpda[rpcs2 & 7], physicalAddress, data, byteFlag);
                    if (result >= 0) {
                        rpda[rpcs2 & 7] = result & 0x1f1f;
                    }
                    break;
                case 0o10: // 17776710 rpcs2 Control status 2
                    result = insertData(rpcs2, physicalAddress, data, byteFlag);
                    if (result >= 0 && data >= 0) {
                        if (result & 0x20) { // on CLR init controller and all drives
                            init();
                        } else {
                            rpcs2 = (result & 0x07); // keep unit only
                            if (DTYPE[rpcs2 & 7] == 0) {
                                rpcs2 |= 0x1000; // NED (12) non-existant drive
                                rpcs1 |= 0x4000; // TRE (14) transfer error
                            }
                        }
                    }
                    break;
                case 0o12: // 17776712 rpds  drive status (read only) (in DRIVE)
                    result = rpds[rpcs2 & 7];
                    break;
                case 0o14: // 17776714 rper1 Error 1 (0) (in DRIVE)
                    result = 0;
                    break;
                case 0o16: // 17776716 rpas  Attention summary (computed)
                    result = 0;
                    for (let drive = 0; drive < 8; drive++) {
                        if (rpds[drive] & 0x8000) {
                            if (data >= 0 && (data & (1 << drive))) {
                                rpds[drive] &= 0x7fff;
                            } else {
                                result |= 1 << drive;
                            }
                        }
                    }
                    if (data >= 0) {
                        rpcs1 &= 0x7fff; // clear SC
                    }
                    break;
                case 0o20: // 17776720 rpla  Look ahead (0) (in DRIVE)
                case 0o22: // 17776722 rpdb  Data buffer (0) (in DRIVE)
                case 0o24: // 17776724 rpmr  Maintenance (0) (in DRIVE)
                    result = 0;
                    break;
                case 0o26: // 17776726 rpdt  Drive type - see table (read only) (in DRIVE)
                    result = DTYPE[rpcs2 & 7];
                    break;
                case 0o30: // 17776730 rpsn  Serial number - use drive # + 1 (read only) (in DRIVE)
                    result = (rpcs2 & 7) + 1;
                    break;
                case 0o32: // 17776732 rpof  Offset register (in DRIVE)
                    result = 0; // Can't see much use for this here
                    break;
                case 0o34: // 17776734 rpdc  Desired cylinder (in DRIVE)
                    result = insertData(rpdc[rpcs2 & 7], physicalAddress, data, byteFlag);
                    if (result >= 0) {
                        rpdc[rpcs2 & 7] = result & 0x3ff;
                    }
                    break;
                case 0o36: // 17776736 rpcc  Current cylinder - return desired cylinder (read only) (in DRIVE)
                    result = rpdc[rpcs2 & 7];
                    break;
                case 0o40: // 17776740 rper2 Error 2 (0) (in DRIVE)
                case 0o42: // 17776742 rper3 Error 3 (0) (in DRIVE)
                case 0o44: // 17776744 rpec1 Error correction 1 (read only) (0) (in DRIVE)
                case 0o46: // 17776746 rpec2 Error correction 2 (read only) (0) (in DRIVE)
                    result = 0;
                    break;
                default:
                    return trap(0o4, 0x10); // Trap 4 - 0x10 Unibus time-out
            }
            return result;
        },
        poll: function(takeInterrupt) {
            "use strict";
            if (iMask) {
                if (takeInterrupt) {
                    if (iMask & 0x100) { // data transfer interrupt?
                        iMask &= ~0x100;
                    } else {
                        for (let drive = 0; drive < 8; drive++) { // find drive non i/o command was for
                            if (iMask & (1 << drive)) {
                                iMask &= ~(1 << drive); // non data transfer complete
                                break;
                            }
                        }
                    }
                    return 0o254; // RP11 vector
                } else {
                    if (rpcs1 & 0x40) { // interrupts still enabled?
                        return 5 << 5; // RP11 priority
                    }
                    iMask = 0;
                }
            }
            return 0;
        },
        reset: init
    };
})());