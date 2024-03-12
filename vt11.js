// Javascript PDP 11/70 Emulator v4.0
// written by Paul Nankervis
// Please send suggestions, fixes and feedback to paulnank@hotmail.com
//
// This code may be used freely provided the original author name is acknowledged in any modified source code
//
//
// This code emulates a VT11 Graphic Display Processor
//
//
// register the VT11 on the i/o page

iopage.register(0o17772000, 4, (function() {
    "use strict";
    const
        WIDTH = 1024, // display width
        HEIGHT = 768; // and height
    var
        DPC, //  17772000 DPC  Display Program Counter
        DSR, //  17772002 DSR  Status Register Stop 15, Mode 14:11 Intensity 10:8 Pen 7 Shift 6, Edge 5 Italics 4 Blink 3 Spare 2 Line 0:1
        Xpen, // 17772004 Xpen Position & Graphplot Increment
        Ypen, // 17772006 Ypen Position & Character
        stopInterrupt, // enable interrupt on stop flag
        penInterrupt, // enable interrupt on light pen hit
        lineRefresh, // DP Refresh or line refresh
        XRegister, // X Position Register
        YRegister, // Y Position Register
        graphIncrement, // Graphplot increment (not implemented)
        blinkFlag,
        mouseX,
        mouseY,
        canvasBG = null,
        canvasFG = null,
        ctxBG = null,
        ctxFG = null,
        refreshTime = 0,
        refreshCount = 0,
        iMask; // Interrupt mask
    function init() {
        "use strict";
        DPC = 0;
        DSR = 0x8000; // Stop 15
        Xpen = 0;
        Ypen = 0;
        stopInterrupt = 0;
        penInterrupt = 0;
        lineRefresh = 0;
        XRegister = 0;
        YRegister = 0;
        graphIncrement = 0;
        blinkFlag = 0;
        iMask = 0; // no interrupts
    }
    function vt11DistanceCheck(Xpos, Ypos, Xend, Yend, Xmouse, Ymouse) { // test if pen over current object
        "use strict";
        const MARGIN = 4;
        if (Xend < Xpos) { // ensure start is on left
            let Xtmp = Xend;
            Xend = Xpos;
            Xpos = Xtmp;
            let Ytmp = Yend;
            Yend = Ypos;
            Ypos = Ytmp;
        }
        if (Xmouse < Xpos) { // check X in range
            if (Xmouse < Xpos - MARGIN) return false;
            Xpen = Xpos;
        } else {
            if (Xmouse > Xend) {
                if (Xmouse > Xend + MARGIN) return false;
                Xpen = Xend;
            } else {
                Xpen = Xmouse; // return X location
            }
        }
        if (Xpos === Xend) { // special case for vertical object
            if (Yend < Ypos) { // ensure start at bottom
                let Ytmp = Ypos;
                Ypos = Yend;
                Yend = Ytmp;
            }
            if (Ymouse < Ypos) {
                if (Ymouse < Ypos - MARGIN) return false;
                Ypen = Ypos;
            } else {
                if (Ymouse > Yend) {
                    if (Ymouse > Yend + MARGIN) return false;
                    Ypen = Yend;
                } else {
                    Ypen = Ymouse; // return Y location
                }
            }
            return true;
        }
        let gradient = (Yend - Ypos) / (Xend - Xpos); // calculate Y hit point from gradient
        let Yhit = (Xpen - Xpos) * gradient + Ypos;
        if (Ymouse < Yhit - MARGIN || Ymouse > Yhit + MARGIN) return false;
        Ypen = ~~Yhit; // return integer calculated Y value
        return true;
    }
    function vt11Initialize() {
        "use strict";
        canvasBG = document.createElement('canvas');
        canvasBG.width = WIDTH;
        canvasBG.height = HEIGHT;
        ctxBG = canvasBG.getContext('2d');
        canvasFG = document.createElement('canvas');
        canvasFG.width = WIDTH;
        canvasFG.height = HEIGHT;
        canvasFG.style.border = "1px solid";
        canvasFG.style.cursor = "none";
        document.getElementById('vt11').appendChild(canvasFG);
        ctxFG = canvasFG.getContext("2d");
        canvasFG.addEventListener('mousemove', vt11TrackMouse, false);
        setInterval(vt11BlinkCycle, 500);
    }
    function vt11BlinkCycle() {
        "use strict";
        blinkFlag = 1 - blinkFlag;
    }
    function vt11TrackMouse(evt) {
        "use strict";
        var rect = canvasFG.getBoundingClientRect();
        mouseX = evt.clientX - rect.left;
        mouseY = evt.clientY - rect.top;
    }
    function vt11ReadWord() {
        "use strict";
        var word = -1;
        if ((DPC & 1) || (word = readWordByPhysical(DPC)) < 0) {
            if (stopInterrupt) { // stop interrupts enabled?
                iMask |= 2; // request stop interrupt
                requestInterrupt();
            }
            DSR |= 0x8000; // stop processor on fail
        } else {
            DPC = (DPC + 2) & 0xffff; // increment DPC
        }
        return word;
    }
    function vt11PaintChar(ctx, code, visible) {
        if (code >= 32 && code <= 127) {
            if (visible) {
                ctx.fillText(String.fromCharCode(code), XRegister, HEIGHT - 1 - YRegister);
            }
            XRegister += 8;
        } else {
            switch (code) {
                case 0o15:
                    XRegister = 0;
                    break;
                case 0o12:
                    YRegister -= 10;
                    if (YRegister < 0) YRegister = 0;
                    break;
            }
        }
    }
    function vt11Processor() {
        "use strict";
        var instruction, instructionExtension, mode;
        ctxBG.beginPath();
        let dataCount = 0;
        let loopTime = Date.now() + 4;
        let loopCount = 1000;
        let loopDPC = DPC;
        do {
            if ((instruction = vt11ReadWord()) < 0) {
                break; // stop on read fail
            }
            if (instruction & 0x8000) { // if control instruction
                mode = (instruction >>> 11) & 0xf;
                if (mode < 8) { // set graphics mode
                    if (mode !== 7) { // set graphics mode if valid
                        DSR = (DSR & 0x87ff) | (instruction & 0x7800); // DSR 14:11 mode
                    }
                    if (instruction & 0x400) { // set intensity if required
                        DSR = (DSR & 0xf8ff) | ((instruction << 1) & 0x700); // DSR 10:8 intensity
                    }
                    if (instruction & 0x40) { // set light pen interrupt if required
                        penInterrupt = (instruction & 0x20);
                    }
                    if (instruction & 0x10) { // set blink if required
                        DSR = (DSR & 0xfff7) | (instruction & 0x8); // DSR 3 blink
                    }
                    if (instruction & 4) { // set line type if required
                        DSR = (DSR & 0xfffc) | (instruction & 0x3); // DSR 1:0 line
                    }
                } else { // control operation
                    switch (mode) {
                        case 0xc: // 1100 Jump
                            if ((instruction = vt11ReadWord()) >= 0) {
                                DPC = instruction;
                            }
                            break;
                        case 0xe: // 1110 SRA Load Status Register A
                            if (instruction & 0x200) { // set stop interrupt enable
                                stopInterrupt = instruction & 0x100;
                            }
                            if (instruction & 0x80) { // set LP intensity hit register?
                                DSR = (DSR & 0xff7f) | ((instruction << 1) & 0x80); // DSR 7 Light Pen (0=on, 1=off!!!)
                                if (DSR & 0x80) {
                                    canvasFG.style.cursor = "none";
                                } else {
                                    canvasFG.style.cursor = "crosshair";
                                }
                            }
                            if (instruction & 0x404) { // stop processing
                                if (stopInterrupt) {
                                    iMask |= 2; // request stop interrupt
                                    requestInterrupt();
                                }
                                DSR |= 0x8000;
                            }
                            if (instruction & 0x20) { // set italics
                                DSR = (DSR & 0xffef) | (instruction & 0x10); // DSR 4 italics
                            }
                            if (lineRefresh != (instruction & 0x4)) {
                            }
                            lineRefresh = instruction & 0x4;
                            break;
                        case 0xf: // 1111 SRB Load Status Register B
                            if (instruction & 0x40) { // set graphplot increment register
                                graphIncrement = instruction & 0x3f;
                            }
                            break;
                    }
                }
            } else { // graphics data
                dataCount++;
                let visible = !(DSR & 0x8) || blinkFlag;
                mode = (DSR >>> 11) & 0xf; // data types depend on stored mode
                if (mode === 0) { // character mode
                    vt11PaintChar(ctxBG, instruction & 0x7f, visible);
                    vt11PaintChar(ctxBG, (instruction >>> 8) & 0x7f, visible);
                } else {
                    let XValue, YValue;
                    if (mode === 2 || mode === 3) { // pre-fetch extension for modes 2 & 3
                        if ((instructionExtension = vt11ReadWord()) < 0) {
                            break; // stop on read fail
                        }
                    }
                    switch (mode) {
                        case 0:
                            break;
                        case 1: // short vector mode
                        case 6: // relative point mode
                            XValue = ((instruction >>> 7) & 0x3f);
                            if (instruction & 0x2000) {
                                XValue = XRegister - XValue;
                            } else {
                                XValue = XRegister + XValue;
                            }
                            YValue = (instruction & 0x3f);
                            if (instruction & 0x40) {
                                YValue = YRegister - YValue;
                            } else {
                                YValue = YRegister + YValue;
                            }
                            break;
                        case 2: // long vector mode
                            XValue = (instruction & 0x3ff);
                            if (instruction & 0x2000) {
                                XValue = XRegister - XValue;
                            } else {
                                XValue = XRegister + XValue;
                            }
                            YValue = (instructionExtension & 0x3ff);
                            if (instructionExtension & 0x2000) {
                                YValue = YRegister - YValue;
                            } else {
                                YValue = YRegister + YValue;
                            }
                            break;
                        case 3: // point mode
                            XValue = (instruction & 0x3ff);
                            YValue = (instructionExtension & 0x3ff);
                            break;
                        case 4: // graph x mode (not implemented)
                            YValue = YRegister + graphIncrement;
                            XValue = instruction & 0x3ff;
                            break;
                        case 5: // graph y mode (not implemented)
                            XValue = XRegister + graphIncrement;
                            YValue = instruction & 0x3ff;
                            break;
                    }
                    let intensify = instruction & 0x4000;
                    if (intensify && visible) { // if visible...
                        let style = ((DSR >>> 7) & 0xe).toString(16) + "0"; // style based on intensity
                        ctxBG.beginPath();
                        ctxBG.strokeStyle = "#" + style + style + style;
                        if (mode === 3 || mode === 6) {
                            ctxBG.fillRect(XValue, HEIGHT - 1 - YValue, 1, 1);
                        } else {
                            switch (DSR & 0x3) {
                                case 0: // solid
                                    ctxBG.setLineDash([]);
                                    break;
                                case 1: // long dash
                                    ctxBG.setLineDash([8, 8]);
                                    break;
                                case 2: // short dash
                                    ctxBG.setLineDash([4, 4]);
                                    break;
                                case 3: // dot dash
                                    ctxBG.setLineDash([2, 2]);
                                    break;
                            }
                            ctxBG.moveTo(XRegister, HEIGHT - 1 - YRegister);
                            ctxBG.lineTo(XValue, HEIGHT - 1 - YValue);
                            ctxBG.stroke();
                        }
                        if (penInterrupt) {
                            if (vt11DistanceCheck(XRegister, YRegister, XValue, YValue, mouseX, HEIGHT - 1 - mouseY)) {
                                iMask |= 1; // request pen hit interrupt
                                requestInterrupt();
                                DSR |= 0x8000; // set done
                            }
                        }
                    }
                    XRegister = XValue; // move to new position
                    YRegister = YValue;
                }
            }
            if (--loopCount <= 0) { // check time remaining every 1000 cycles
                if (Date.now() >= loopTime) {
                    break;
                } else {
                    loopCount = 1000;
                }
            }
        } while (!(DSR & 0x8000) && DPC != loopDPC);
        if (dataCount >= refreshCount || Date.now() > refreshTime) {
            ctxFG.clearRect(0, 0, WIDTH, HEIGHT);
            ctxFG.beginPath();
            ctxFG.drawImage(canvasBG, 0, 0); // move background to foreground
            ctxBG.clearRect(0, 0, WIDTH, HEIGHT); // and start again
            refreshCount = dataCount;
            refreshTime = Date.now() + 800;
        }
        if (!(DSR & 0x8000)) { // ff more to process schedule it...
            setTimeout(vt11Processor, 15);
        }
    }
    init();
    return {
        access: function(physicalAddress, data, byteFlag) {
            "use strict";
            var result;
            switch (physicalAddress & 0o6) {
                case 0o0: // 17772000 DPC Program Counter
                    result = insertData(DPC, physicalAddress, data, byteFlag);
                    if (result >= 0 && data >= 0) {
                        if (ctxBG === null) { // First time through preparation
                            vt11Initialize();
                        }
                        if (!(result & 1)) { // set DPC unless odd (usually 1) which just restarts
                            DPC = result & 0xfffe;
                        }
                        if (DSR & 0x8000) { // if required kick start VT11 processor...
                            DSR &= 0x7fff;
                            setTimeout(vt11Processor, 15);
                        }
                    }
                    break;
                case 0o2: // 17772002 DSR Status Register (read only)
                    result = DSR;
                    break;
                case 0o4: // 17772004 Xpen Position & Graphplot Increment (read only)
                    result = (Xpen & 0x3ff) | ((graphIncrement & 0x2f) << 10); // return light pen X location
                    break;
                case 0o6: // 17772006 Ypen Position & Character (read only)
                    result = Ypen & 0x3ff; // return light pen Y location
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
                        return 0o324; // VT11 pen hit vector
                    } else {
                        iMask = 0;
                        return 0o320; // VT11 stop vector
                    }
                } else {
                    return 4 << 5; // VT11 priority
                }
            }
            return 0;
        },
        reset: init
    };
})());