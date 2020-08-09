// Javascript PDP 11/70 Emulator v3.0
// written by Paul Nankervis
// Please send suggestions, fixes and feedback to paulnank@hotmail.com
//
// This code may be used freely provided the original author name is acknowledged in any modified source code
//
//

var VT52 = []; // Array of VT52 objects ie: [ {mode: 0, escape: 0, keypad: 0, graphics: 0, row: 0, col: 0, screen: []}, ...]

function vt52Paint(unit, remove, ch) {
    "use strict";
    var i, textPosition, screenUpdates, vt52, elementId;
    screenUpdates = 0;
    vt52 = VT52[unit];
    elementId = DL11[unit].elementId;
    if (!vt52.mode) { // If not in VT52 mode take existing textarea and format into screen array
        vt52.screen = elementId.value.split('\n');
        if (vt52.screen.length > 24) { // throw away off screen lines
            vt52.screen.splice(0, vt52.screen.length - 24);
        }
        for (i = 0; i < vt52.screen.length; i++) { // clobber long lines
            if (vt52.screen[i].length > 80) {
                vt52.screen[i] = vt52.screen[i].substr(0,79);
            }
        }
        for (i = vt52.screen.length; i < 24; i++) { // extend short screen
            vt52.screen[i] = "";
        }
        screenUpdates++;
        vt52.mode = 1;
    }
    if (remove < 0) { // For reverse line feed scroll the screen down
        for (i = 23; i >= 1; i--) {
            vt52.screen[i] = vt52.screen[i - 1];
        }
        vt52.screen[0] = "";
        screenUpdates++;
    }
    if (remove > 0) { // Clear rest of line - and optionally rest of screen
        vt52.screen[vt52.row] = vt52.screen[vt52.row].substr(0, vt52.col);
        if (remove & 2) {
            for (i = vt52.row + 1; i < 24; i++) {
                vt52.screen[i] = "";
            }
        }
        screenUpdates++;
    }
    if (vt52.screen[vt52.row].length < vt52.col) { // Ensure current line is long enough to position cursor
        vt52.screen[vt52.row] += " ".repeat(vt52.col - vt52.screen[vt52.row].length);
        screenUpdates++;
    }

    if (ch) { // Put character in current line
        if (vt52.graphics) {
            if (ch == 97) { // This version subsets ONE graphics character. If this catches on more may be required.
                ch = 182;
            }
        }
        vt52.screen[vt52.row] = vt52.screen[vt52.row].substr(0, vt52.col) + String.fromCharCode(ch) + vt52.screen[vt52.row].substr(vt52.col + 1);
        if (vt52.col < 79) vt52.col++;
        screenUpdates++;
    }
    if (screenUpdates) { // If screen changed then update it
        elementId.value = vt52.screen.join('\n');
    }
    textPosition = vt52.col; // Determine cursor position
    for (i = 0; i < vt52.row; i++) {
        textPosition += vt52.screen[i].length + 1;
    }
    setTimeout(function() {
        elementId.setSelectionRange(textPosition, textPosition);
    }, 0);
}

function vt52Refresh(unit) { // Delayed refresh for hardcopy mode - to make darned iPad behaviour better!
	var vt52 = VT52[unit];
    var elementId = DL11[unit].elementId;
	if (vt52.buffer.length > 0) {
		if (elementId.value.length > 24000) {
            elementId.value = elementId.value.substring(elementId.value.length - 4000) + vt52.buffer;
		} else {
			elementId.value += vt52.buffer;
		}
		vt52.buffer = '';
	}
	if (vt52.setCursor) {
		elementId.scrollTop = elementId.scrollHeight;
		vt52.setCursor = 0;
	}
}

function vt52Write(unit, ch) { // Harcopy mode write - too hard to think about buffering in vt52 mode
	var vt52 = VT52[unit];
	if (vt52.buffer.length <= 0) { // No write queued then make one
		setTimeout(vt52Refresh, 16, unit);
	}
	vt52.buffer += String.fromCharCode(ch);
}

function vt52Put(unit, ch) {
    "use strict";
    var vt52, elementId;
    if (typeof VT52[unit] === "undefined") {
        VT52[unit] = {
            mode: 0,
            escape: 0,
            keypad: 0,
            graphics: 0,
            row: 0,
            col: 0,
            screen: [],
			setCursor: 0,
			buffer: ''
        };
    }
    vt52 = VT52[unit];
    elementId = DL11[unit].elementId;
    switch (vt52.escape) {
        case 0: // No escape sequence in progress
            switch (vt52.mode) {
                case 0: // Hardcopy Mode - Normal scolling (don't care about VT52 things)
                    switch (ch) {
                        case 8: // 010 BS
							if (vt52.buffer.length > 0) {
								vt52.buffer = vt52.buffer.substring(0, vt52.buffer.length - 1);
							} else {
								elementId.value = elementId.value.substring(0, elementId.value.length - 1);
							}
                            break;
                        case 9: // 011 TAB
							vt52Write(unit, ch);
                            break;
                        case 10: // 012 LF
							vt52.setCursor = 1;
							vt52Write(unit, ch);
                            break;
                        case 27: // 033 ESC
							if (vt52.buffer.length > 0) {
								elementId.value += vt52.buffer; // Empty print buffer before going to vt52 mode
								vt52.buffer = '';
							}
                            vt52.escape = 1; // Next char will be part of escape sequence
                            break;
                        default:
                            if (ch >= 32 && ch <= 126) { // If printable add it to the canvas
								vt52Write(unit, ch);
                            }
                    }
                    break;
                case 1: // VT52 Mode - Escape sequence has triggered VT52 processing
                    switch (ch) {
                        case 8: // 010 BS - move left, no erasure
                            if (vt52.col) vt52.col--;
                            vt52Paint(unit, 0, 0);
                            break;
                        case 9: // 011 TAB - move to next TAB stop
                            if (vt52.col < 79) {
                                if (vt52.col < 72) {
                                    vt52.col = (~~(vt52.col / 8) + 1) * 8;
                                } else {
                                    vt52.col++;
                                }
                            }
                            vt52Paint(unit, 0, 0);
                            break;
                        case 10: // 012 LF - row increases unless at end - then scroll
                            if (vt52.row < 23) {
                                vt52.row++;
                                vt52Paint(unit, 0, 0);
                            } else {
                                elementId.value += '\n';
                                elementId.scrollTop = elementId.scrollHeight;
                                vt52.mode = 0; // Drop out of VT52 mode if scrolling at bottom line
                            }
                            break;
                        case 13: // 015 CR - move to start of current row
                            vt52.col = 0;
                            vt52Paint(unit, 0, 0);
                            break;
                        case 27: // 033 ESC
                            vt52.escape = 1; // Next char will be part of escape sequence
                            break;
                        default: // Paint character at current location
                            if (ch >= 32 && ch <= 126) { // If printable put it on the screen
                                vt52Paint(unit, 0, ch);
                            }
                    }
                    break;
            }
            break;
        case 1: // Escape received - expecting to receive rest of VT52 escape sequence
            vt52.escape = 0; // Nearly all escape sequences end here so assume done
            switch (String.fromCharCode(ch)) {
                case '=': // Enter alternate keypad mode
                    vt52.keypad = 1;
                    break;
                case '>': // Exit alternate keypad mode
                    vt52.keypad = 0;
                    break;
                case 'F': // Use special graphics character set
                    vt52.graphics = 1;
                    break;
                case 'G': // Use normal US/UK character set
                    vt52.graphics = 0;
                    break;
                case 'A': // Move cursor up one line
                    if (vt52.row) vt52.row--;
                    vt52Paint(unit, 0, 0)
                    break;
                case 'B': // Move cursor down one line
                    if (vt52.row < 23) vt52.row++;
                    vt52Paint(unit, 0, 0)
                    break;
                case 'C': // Move cursor right one char
                    if (vt52.col < 79) vt52.col++;
                    vt52Paint(unit, 0, 0)
                    break;
                case 'D': // Move cursor left one char
                    if (vt52.col) vt52.col--;
                    vt52Paint(unit, 0, 0);
                    break;
                case 'H': // Move cursor to upper left corner
                    vt52.col = 0;
                    vt52.row = 0;
                    vt52Paint(unit, 0, 0)
                    break;
                case 'I': // Generate a reverse line-feed
                    vt52Paint(unit, -1, 0)
                    break;
                case 'J': // Erase to end of screen
                    vt52Paint(unit, 2, 0)
                    break;
                case 'K': // Erase to end of current line
                    vt52Paint(unit, 1, 0)
                    break;
                case 'Y': // Part I - Move cursor to r,c location
                    vt52.escape = 2; // This sequence has more characters
                    break;
                case 'Z': // Identify what the terminal is: ESC / K (VT52)
                    dl11_input(unit, String.fromCharCode(27) + "/K")
                    break;
            }
            break;
        case 2: // Escape + 1 received:- Process character 3 (of Move cursor to r,c location)
            if (ch >= 32 && ch < 32 + 24) {
                vt52.escape = 3;
                vt52.row = ch - 32;
            } else {
                vt52.escape = 0;
            }
            break;
        case 3: // Escape + 2 received:- Process character 4 (of Move cursor to r,c location)
            if (ch >= 32 && ch < 32 + 80) {
                vt52.col = ch - 32;
                vt52Paint(unit, 0, 0);
            }
            vt52.escape = 0;
            break;
    }
}

const vt52KeyMap = [
    [12, "?u"], // Numpad 5 ESC ? u
    [33, "?l"], // Numpad + ESC ? l
    [33, "?y"], // Numpad 9 ESC ? y What about dups?
    [34, "?s"], // Numpad 3 ESC ? s
    [35, "?q"], // Numpad 1 ESC ? q
    [36, "?w"], // Numpad 7 ESC ? w
    [37, "?t"], // Numpad 4 ESC ? t
    [37, "D"], // Left arrow  ESC D
    [38, "?x"], // Numpad 8 ESC ? x
    [38, "A"], // Up arrow  ESC A
    [39, "?v"], // Numpad 6 ESC ? v
    [39, "C"], // Right arrow ESC C
    [40, "?r"], // Numpad 2 ESC ? r
    [40, "B"], // Down arrow  ESC B
    [45, "?p"], // Numpad 0 ESC ? p
    [96, "?p"], // Numpad 0 ESC ? p
    [97, "?q"], // Numpad 1 ESC ? q
    [98, "?r"], // Numpad 2 ESC ? r
    [99, "?s"], // Numpad 3 ESC ? s
    [100, "?t"], // Numpad 4    ESC ? t
    [101, "?u"], // Numpad 5    ESC ? u
    [102, "?v"], // Numpad 6    ESC ? v
    [103, "?w"], // Numpad 7    ESC ? w
    [104, "?x"], // Numpad 8    ESC ? x
    [105, "?y"], // Numpad 9    ESC ? y
    [106, "R"], // Numpad * (PF3)  ESC R
    [107, "?l"], // Numpad +    ESC ? l
    [111, "Q"], // Numpad / (PF2)  ESC Q
    [111, "S"], // Numpad - (PF4)  ESC S
    [144, "P"], // Num Lock (PF1)  ESC P
];

function vt52KeyDown(unit, code, event) {
    "use strict";
    var i;
    if (typeof VT52[unit] !== "undefined" && VT52[unit].keypad) {
        for (i = 0; i < vt52KeyMap.length; i++) {
            if (code == vt52KeyMap[i][0]) {
                dl11_input(unit, String.fromCharCode(27) + vt52KeyMap[i][1]);
                return false; // Replace key with our version
            }
            if (code < vt52KeyMap[i][0]) {
                break;
            }
        }
        if (code == 13 && event.location === 3) {
            dl11_input(unit, String.fromCharCode(27) + "?M");
            return false; // Replace key with our version
        }
    }
    return true; // Process as typed
}