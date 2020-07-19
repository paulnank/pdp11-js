// 017772000 - 017772006 VT11 control registers
// Stop interrupt 320
// Light pen interrupt 324
// Time out/Shift out interrupt 330
// All interrupts at BR4
// 1024 x 768 (0,0) at bottom left
// screen content fades in approx 30ms  :-(
// light pen detects a hit within a region :-(
//
// still need line types, blinking & intensity
// need to track if refreshing/active better
//
var vt11 = {
    stopInterrupt: 0, // enable interrupt on stop flag
    penInterrupt: 0, // enable interrupt on pen flag
    refreshOn: 0, // DP Refresh or line refresh
    DPC: 0, // Display Program Counter
    DSR: 0x8000, // Display Status Register  Stop 15, Mode 14:11 Intensity 10:8 Pen 7 Shift 6, Edge 5 Italics 4 Blink 3 Spare 2 Line 0:1
    XRegister: 0, // X Status Register
    YRegister: 0, // Y Status Register
    graphIncrement: 0, // Graphplot increment
    canvasFG: null,
    canvasBG: null,
    ctxFG: null,
    ctxBG: null,
    refreshDPC: 0,
    refreshTime: 0,
    blinkFlag: 0,
    penX: 0,
    penY: 0,
    mouseX: 0,
    mouseY: 0,
    DEBUG: 0 // debug mode
};

function vt11Initialize() {
    vt11.canvasFG = document.createElement('canvas');
    vt11.canvasFG.width = 1024;
    vt11.canvasFG.height = 768;
    vt11.canvasFG.style.border = "1px solid";
    vt11.canvasFG.style.cursor = "none";
    document.getElementById('vt11').appendChild(vt11.canvasFG);
    vt11.ctxFG = vt11.canvasFG.getContext("2d");
    vt11.canvasBG = document.createElement('canvas');
    vt11.canvasBG.width = 1024;
    vt11.canvasBG.height = 768;
    vt11.ctxBG = vt11.canvasBG.getContext('2d');
    vt11.canvasFG.addEventListener('mousemove', vt11TrackMouse, false);
    setInterval(vt11BlinkCycle, 500);
}

function vt11TrackMouse(evt) {
    var rect = vt11.canvasFG.getBoundingClientRect();
    vt11.mouseX = evt.clientX - rect.left,
        vt11.mouseY = evt.clientY - rect.top
}

function vt11BlinkCycle() {
    vt11.blinkFlag = 1 - vt11.blinkFlag;
}

function vt11Read(physicalAddress) {
    if (physicalAddress & 1) {
        CPU.CPU_Error |= 0x40;
        return trap(4, 26);
    } else {
        return readWordByPhysical(physicalAddress);
    }
}

function vt11PaintChar(ctx, code) {
    if (code >= 32 && code <= 127) {
        ctx.fillText(String.fromCharCode(code), vt11.XRegister, 767 - vt11.YRegister);
        vt11.XRegister += 8;
    } else {
        switch (code) {
            case 015:
                vt11.XRegister = 0;
                break;
            case 012:
                vt11.YRegister -= 10;
                if (vt11.YRegister < 0) vt11.YRegister = 0;
                break;
        }
    }
}

function vt11Refresh() { // all drawing happens in background canvas which is periodically moved to the foreground
    if (vt11.refreshOn) {
        vt11.ctxFG.clearRect(0, 0, 1024, 768);
        vt11.ctxFG.beginPath();
        vt11.ctxFG.drawImage(vt11.canvasBG, 0, 0);
        if (!(vt11.DSR & 0x80)) {
            vt11.ctxFG.fillRect(vt11.mouseX, vt11.mouseY, 3, 2); // mark light pen position
        }
        vt11.ctxBG.clearRect(0, 0, 1024, 768);
        vt11.ctxBG.beginPath();
    }
    vt11.refreshDPC = vt11.DPC; // refresh done when we see the same DPC location
    vt11.refreshTime = Date.now() + 800; // or a timeout
}


function vt11DistanceCheck(x1, y1, x2, y2, p, q) {
    var dx, dy;
    // check if near (x1,y1)
    var dx = x1 - p;
    var dy = y1 - q;
    if (Math.sqrt(dx * dx + dy * dy) < 8) {
        vt11.penX = x1;
        vt11.penY = y1;
        return true;
    }
    // if other point is the same we have finished
    if (x1 == x2 && y1 == y2) {
        return false;
    }
    // check if near (x2,y2)
    var dx = x2 - p;
    var dy = y2 - q;
    if (Math.sqrt(dx * dx + dy * dy) < 8) {
        vt11.penX = x2;
        vt11.penY = y2;
        return true;
    }
    // check if point outside x range
    if ((p < x1 && p < x2) || (p > x1 && p > x2)) {
        return false;
    }
    // check if point outside y range
    if ((q < y1 && q < y2) || (q > y1 && q > y2)) {
        return false;
    }
    // check if x is the same (vertical line)
    if (x1 == x2) {
        vt11.penX = x1;
        vt11.penY = q;
        return (Math.abs(p - x1) < 8);
    }
    // check if y is the same (horizontal line)
    if (y1 == y2) {
        vt11.penX = p;
        vt11.penY = y1;
        return (Math.abs(q - y1) < 8);
    }
    // calculate distance from line
    dx = x2 - x1;
    dy = y2 - y1;
    if ((Math.abs(dy * p - dx * q + x2 * y1 - y2 * x1) / Math.sqrt(dy * dy + dx * dx)) < 8) {
        vt11.penX = p; // fake it for now
        vt11.penY = q; // fake it for now
        return true;
    }
    return false;
}


function vt11Execute() {
    //"use strict";
    var count, instruction, mode, intensify, style, penHit, XValue, YValue;
    if (vt11.ctxBG === null) {
        vt11Initialize();
    }
    if (vt11.DPC == vt11.refreshDPC || vt11.refreshTime < Date.now()) {
        vt11Refresh();
    }
    vt11.refreshOn = 1;
    vt11.DSR &= ~0x8000; // clear done
    for (count=0; count<8000; count++) {
        if ((instruction = vt11Read(vt11.DPC)) >= 0) {
            vt11.DPC = (vt11.DPC + 2) & 0xffff;
            if (!(instruction & 0x8000)) { // data vs control
                mode = (vt11.DSR >> 11) & 0xf; // data values depend on stored mode
                intensify = instruction & 0x4000;
                if (vt11.DEBUG) console.log((vt11.DPC - 2).toString(8) + " " + instruction.toString(8) + " Data mode " + mode.toString(2) + " I " + (intensify >> 14) + " X " + vt11.XRegister + " Y " + vt11.YRegister);
                switch (mode) {
                    case 0: // character mode
                        break;
                    case 1: // short vector mode
                    case 6: // relative point mode
                        XValue = ((instruction >> 7) & 0x3f);
                        if (instruction & 0x2000) {
                            XValue = vt11.XRegister - XValue;
                        } else {
                            XValue = vt11.XRegister + XValue;
                        }
                        YValue = (instruction & 0x3f);
                        if (instruction & 0x40) {
                            YValue = vt11.YRegister - YValue;
                        } else {
                            YValue = vt11.YRegister + YValue;
                        }
                        break;
                    case 2: // long vector mode
                    case 3: // point mode
                        XValue = (instruction & 0x3ff);
                        if (mode == 2) {
                            if (instruction & 0x2000) {
                                XValue = vt11.XRegister - XValue;
                            } else {
                                XValue = vt11.XRegister + XValue;
                            }
                        }
                        if ((instruction = vt11Read(vt11.DPC)) >= 0) {
                            vt11.DPC = (vt11.DPC + 2) & 0xffff;
                            YValue = (instruction & 0x3ff);
                            if (mode == 2) {
                                if (instruction & 0x2000) {
                                    YValue = vt11.YRegister - YValue;
                                } else {
                                    YValue = vt11.YRegister + YValue;
                                }
                            }
                            if (vt11.DEBUG) console.log((vt11.DPC - 2).toString(8) + " " + instruction.toString(8) + " Extend " + " Xvalue " + XValue + " Yvalue " + YValue);
                        }
                        break;
                    case 4: // graph x mode
                        YValue = YRegister + vt11.graphIncrement;
                        XValue = instruction & 0x3ff;
                        break;
                    case 5: // graph y mode
                        XValue = XRegister + vt11.graphIncrement;
                        YValue = instruction & 0x3ff;
                        break;
                }
                if (instruction >= 0) {
                    penHit = 0;
                    if (!(vt11.DSR & 0x8) || vt11.blinkFlag) { // if not blinking or in blink cycle paint this...
                        if (mode == 0) { // character mode
                            vt11PaintChar(vt11.ctxBG, instruction & 0x7f);
                            vt11PaintChar(vt11.ctxBG, (instruction >> 8) & 0x7f);
                            if (vt11.DEBUG) console.log((vt11.DPC - 2).toString(8) + " write text " + String.fromCharCode(instruction & 0x7f, (instruction >> 8) & 0x7f));
                        } else {
                            if (intensify) {
                                style = ((vt11.DSR >> 7) & 0xe).toString(16) + "0"; // style based on intensity
                                vt11.ctxBG.beginPath();
                                vt11.ctxBG.strokeStyle = "#" + style + style + style;
                                if (mode == 3 || mode == 6) {
                                    vt11.ctxFG.fillRect(XValue, 767 - YValue, 1, 1);
                                } else {
                                    switch (vt11.DSR & 0x3) {
                                        case 0: // solid
                                            vt11.ctxBG.setLineDash([]);
                                            break;
                                        case 1: // long dash
                                            vt11.ctxBG.setLineDash([8, 8]);
                                            break;
                                        case 2: // short dash
                                            vt11.ctxBG.setLineDash([4, 4]);
                                            break;
                                        case 3: // dot dash
                                            vt11.ctxBG.setLineDash([2, 2]);
                                            break;
                                    }
                                    vt11.ctxBG.moveTo(vt11.XRegister, 767 - vt11.YRegister);
                                    vt11.ctxBG.lineTo(XValue, 767 - YValue);
                                    vt11.ctxBG.stroke();
                                }

                                if (vt11.penInterrupt) {
                                    if (vt11DistanceCheck(vt11.XRegister, vt11.YRegister, XValue, YValue, vt11.mouseX, 767 - vt11.mouseY)) {
                                        penHit = 1;
                                    }
                                }
                            }
                        }
                    }
                    if (mode != 0) {
                        vt11.XRegister = XValue;
                        vt11.YRegister = YValue;
                    }
                    if (penHit) {
                        interrupt(0, 4 << 5, 0o324, 0);
                        vt11.DSR |= 0x8000; // set done
                        return;
                    }
                }
            } else {
                mode = (instruction >> 11) & 0xf; // control words contain a mode
                if (vt11.DEBUG) console.log((vt11.DPC - 2).toString(8) + " " + instruction.toString(8) + " Control mode " + mode.toString(2));
                if (mode <= 7) { // set graphics mode
                    if (mode != 7) { // mode
                        vt11.DSR = (vt11.DSR & 0x87ff) | (instruction & 0x7800);
                    }
                    if (instruction & 0x400) { // intensity
                        vt11.DSR = (vt11.DSR & 0xf8ff) | ((instruction << 1) & 0x700);
                    }
                    if (instruction & 0x40) { // Light pen interrupt
                        vt11.penInterrupt = (instruction & 0x20);
                    }
                    if (instruction & 0x10) { // blink
                        vt11.DSR = (vt11.DSR & 0xfff7) | (instruction & 0x8);
                    }
                    if (instruction & 4) { // line type
                        vt11.DSR = (vt11.DSR & 0xfffc) | (instruction & 0x3);
                    }
                } else {
                    switch (mode) {
                        case 0xc: // jump
                            if ((instruction = vt11Read(vt11.DPC)) >= 0) {
                                if (vt11.DEBUG) console.log((vt11.DPC).toString(8) + " " + instruction.toString(8) + " Jump to " + instruction.toString(8));
                                vt11.DPC = instruction;
                            }
                            break;
                        case 0xe: // status register a
                            if (instruction & 0x200) { // set stop interrupt enable
                                vt11.stopInterrupt = instruction & 0x100;
                            }
                            if (instruction & 0x80) { // set LP intensity hit register?
                                vt11.DSR = (vt11.DSR & 0xff7f) | ((instruction << 1) & 0x80); // set LP flag (0=on, 1=off!!!)
                            }
                            if (instruction & 0x20) { // set italics
                                instruction & 0x10;
                            }
                            if (instruction & 0x404) {
                                if (instruction & 0x4) {
                                    vt11.refreshOn = 0;
                                }
								instruction = -1; // halt on either DPU stop or line frequency
                            }
                            break;
                        case 0xf: // status register b
                            if (instruction & 0x40) { // set graphplot increment register
                                vt11.grphIncrement = instruction & 0x3f;
                            }
                            break;
                    }
                }
            }
        }
		if (instruction < 0) {
			break;
		}
    }
	if (instruction >= 0) {
		setTimeout(vt11Execute, 1); // do a batch of instruction but if too many schedule more for later
		return;
	}
    if (vt11.DEBUG) console.log((vt11.DPC).toString(8) + " **end** X " + vt11.XRegister + " Y " + vt11.YRegister);
    if (vt11.stopInterrupt) {
        interrupt(20, 4 << 5, 0o320, 0);
    }
    vt11.DSR |= 0x8000; // set done
}

function accessVT11(physicalAddress, data, byteFlag) {
    var result;
    switch (physicalAddress & ~1) {
        case 017772000: // vt11.DPC
            result = insertData(vt11.DPC, physicalAddress, data, byteFlag);
            if (result >= 0) {
                if (data >= 0 && result != 0) {
                    if (vt11.DEBUG) console.log((vt11.DPC).toString(8) + " **write to DPC** " + result.toString(8) + " X " + vt11.XRegister + " Y " + vt11.YRegister);
                    if (!(result & 1)) {
                        vt11.DPC = result;
                    }
                    if ((vt11.DSR & 0x8000)) { // need better track of whether active
                        vt11Execute();
                    }
                }
            }
            break;
        case 017772002: // vt11.DSR
            result = vt11.DSR;
            break;
        case 017772004: // light pen Y  ?? fix to add top bits
            result = (vt11.penX & 0x3ff) | ((vt11.graphIncrement & 0x2f) << 10); // return light pen X location
            break;
        case 017772006: // light pen X  ?? fix to add top bits
            result = vt11.penY & 0x3ff; // return light pen Y location
            break;
        default:
            CPU.CPU_Error |= 0x10;
            return trap(4, 134);
    }
    return result;
}