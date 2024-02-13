// Javascript PDP 11/70 Emulator v3.2
// written by Paul Nankervis
// Please send suggestions, fixes and feedback to paulnank@hotmail.com
//
// This code may be used freely provided the original author name is acknowledged in any modified source code
//
//
// This code emulates the function of a PDP 11/70 CPU.
//
//
const
    IOBASE_VIRT = 0o160000,
    IOBASE_18BIT = 0o760000,
    IOBASE_UNIBUS = 0o17000000,
    IOBASE_22BIT = 0o17760000,
    MAX_MEMORY = IOBASE_UNIBUS - 16384, // Maximum memory address (need less memory for BSD 2.9 boot)
    MMU_READ = 16, // READ & WRITE bits used to indicate access type in memory operations
    MMU_WRITE = 32, // but beware lower 4 bits used as auto-increment length when getting virtual address
    MMU_LENGTH_MASK = 0xf, // Mask for operand length (which can be up to 8 for FPP)
    MMU_LENGTH_EVEN = MMU_LENGTH_MASK - 1, // Mask length even only (for SP)
    MMU_BYTE = 1, // Byte length in 4 bits - also used as byte test mask
    MMU_WORD = 2, // Word length
    MMU_BYTE_READ = MMU_READ | MMU_BYTE, // Read flag with byte length
    MMU_WORD_READ = MMU_READ | MMU_WORD,
    MMU_BYTE_WRITE = MMU_WRITE | MMU_BYTE,
    MMU_WORD_WRITE = MMU_WRITE | MMU_WORD,
    MMU_BYTE_MODIFY = MMU_READ | MMU_WRITE | MMU_BYTE,
    MMU_WORD_MODIFY = MMU_READ | MMU_WRITE | MMU_WORD, // Read & write flags with word length
    STATE_RUN = 0, // Define legal values for CPU.runState (run, reset, wait, halt)
    STATE_RESET = 1,
    STATE_WAIT = 2,
    STATE_HALT = 3;


// Below are the CPU registers. At simplest level a PDP 11 program has 8 registers (0-5 are general, 6 is the stack
// pointer, and 7 is the PC), 4 condition codes (Negative, Zero, Overflow and Carry), up to 28K words of memory,
// and 4K of I/O page address space. All device I/O and access to other features (including memory management)
// is done through reference to the I/O page at the top of physical memory.
// Memory management enables 3 modes (Kernel, Supervisor and User) each of which have their own mapping of memory
// from a 17 bit virtual address (16 bits for instruction and 16 for data), to 22 bits of physical bus space.
// Thus a program virtual address space can be up to 32K words of instruction space and 32K words of data space.
// The distinction between these spaces is that references based on register 7 (the program counter) refer to
// instruction space, while all other references are to data space.
// I/O and control of devices is done by writing to device registers in the I/O page at the top 4K of
// physical memory. It is implemented here by calling the access_iopage() function in module iopage.js.
// For example to send a character to the console terminal a program would write to the console transmit buffer at
// virtual address 177566 - assuming that this is mapped to physical address 17777566. Also located in the I/O page
// are things like the Program Status Word (PSW which contains CPU priority, memory management mode, condition
// codes etc), Memory Management registers, the Stack limit register, Program Interrupt register, each memory
// management mode stack pointer (R6), as well as two sets of general registers (selection by program status).
// Floating point arithmetic is handled by a separate module. It is implemented by calling the executeFPP()
// function in module fpp.js whenever a floating point instruction is encountered.
// Traps are implemented by the trap() function below. Traps read a new PC and PSW from a vector in kernel data
// space, and then save the old values on to the new mode stack. Software can resume processing at the end of an
// interrupt service routine by using an RTT or RTI instruction to restore the PC and PSW.
// The trap vector depends on the kind of trap, for example 4 for an odd address, 10 for an invalid instruction,
// or 20 when an IOT instruction is encountered.
// I/O traps occur when a device needs to signal attention, for example at the completion of an operation. In this
// case the device code calls the interrupt() function below to queue a trap to the appropriate trap vector
// with a priority code. When the CPU priority in the PSW falls below that interupt level then the device I/O
// trap will trigger.

var CPU = {
    CPU_Error: 0,
    MMR0: 0, // MMU control registers
    MMR1: 0,
    MMR2: 0,
    MMR3: 0,
    MMR3KSxU: 0x0, // MMR3 D space bits unpacked for faster access
    PIR: 0, // Programmable interrupt register
    PSW: 0xf, // PSW less flags C, N, V & Z
    controlReg: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // various control registers we don't really care about
    cpuType: 70,
    displayAddress: 0, // Address display for console operations
    displayBusReg: 0, // Bus Register display (we don't really have one)
    displayDataPaths: 0, // Console display data path (random except in console operations or non-run state)
    displayMicroAdrs: 0, // Micro Address display (we don't really have one)
    displayPhysical: 0, // Physical address display for console operations
    displayRegister: 0, // Console display lights register (set by software)
    flagC: 0x10000, // PSW C bit
    flagN: 0x8000, // PSW N bit
    flagV: 0x8000, // PSW V bit
    flagZ: 0xffff, // ~ PSW Z bit
    interruptQueue: [], // List of interrupts pending
    loopBase: 100, // Base for loop count calculation (trying to allow for vastly different browser speeds)
    memory: new Array(MAX_MEMORY/2), // Main memory (in words - addresses must be halved for indexing)
    mmuEnable: 0, // MMU enable mask for MMU_READ and/or MMU_WRITE
    mmuLastPage: 0, // last used MMU page for MMR0 - 2 bits of mode and 4 bits of I/D page - used as an index into PAR/PDR
    mmuMode: 0, // current memory management mode (0=kernel,1=super,2=undefined,3=user)
    mmuPAR: [
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, //0 kernel
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, //1 super
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, //2 illegal
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 //3 user
    ], // memory management PAR registers by mode
    mmuPDR: [
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, //0 kernel
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, //1 super
        0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff, 0xffff, // 2 illegal
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 //3 user
    ], // memory management PDR registers by mode
    modifyAddress: -1, // If the register is < 0 then remember the memory physical address
    modifyRegister: -1, // Remember the address of a register in a read/write (modify) cycle
    priorityReview: 1, // flag to mark if we need to check priority change
    registerAlt: [0, 0, 0, 0, 0, 0], // Alternate registers R0 - R5
    registerVal: [0, 0, 0, 0, 0, 0, 0, 0], // Current registers  R0 - R7
    runState: STATE_HALT, // current machine state STATE_RUN, STATE_RESET, STATE_WAIT or STATE_HALT
    stackLimit: 0xff, // stack overflow limit
    stackPointer: [0, 0, 0, 0], // Alternate R6 (kernel, super, illegal, user)
    statusLights: 0x3000, // Need to remember console address error light status
    switchRegister: 0, // console switch register
    trapMask: 0, // Mask of traps to be taken at the end of the current instruction
    trapPSW: -1, // PSW when first trap invoked - for tackling double traps
    unibusMap: [
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
    ] // 32 unibus mapping registers
};

// Instruction logging stuff - useful ONLY in browser debugging mode!!
var log = {
    limit: 0, // Size of instruction log (0 is off)
    debugPC: 0, // PC for debugging - used for setting browser breakpoint when the PC reaches this value
    ring: [] // Data for instruction logging (for debugging)
};

// Debug routine to print the contents of the instruction log
function log_print() {
    "use strict";
    var R = ["r0", "r1", "r2", "r3", "r4", "r5", "sp", "pc"];

    function toOct(n, l) {
        var o = n.toString(8);
        return "0".repeat((typeof l !== "undefined" ? l : 6) - o.length) + o;
    }

    function opr(pc, i, a) { // Print an operand
        var r = i & 7;
        switch ((i >>> 3) & 7) {
            case 0: //      R       Register
                return R[r];
            case 1: //      (R)     Register Deferred
                return "(" + R[r] + ")";
            case 2: //      (R)+    Autoincrement
                if (r == 7 && typeof a !== "undefined") {
                    return "#" + a.toString(8);
                } else {
                    return "(" + R[r] + ")+";
                }
            case 3: //      @(R)+   Autoincremenet Deferred
                if (r == 7 && typeof a !== "undefined") {
                    return "@#" + a.toString(8);
                } else {
                    return "@(" + R[r] + ")+";
                }
            case 4: //      -(R)    Autodecrement
                return "-(" + R[r] + ")";
            case 5: //      @-(R)   Autodecrement Deferred
                return "@-" + R[r];
            case 6: //      x(R)    Index
                if (r == 7 && typeof a !== "undefined") {
                    return ((pc + a) & 0xffff).toString(8);
                } else {
                    return (typeof a !== "undefined" ? a.toString(8) : "x") + "(" + R[r] + ")";
                }
            case 7: //      @x(R)   Index Deferred
                if (r == 7 && typeof a !== "undefined") {
                    return "@" + ((pc + a) & 0xffff).toString(8);
                } else {
                    return "@" + (typeof a !== "undefined" ? a.toString(8) : "x") + "(" + R[r] + ")";
                }
        }
    }
    console.log("Flags    PC    Instruction");
    for (let i = 0; i < log.ring.length; i++) {
        let e = log.ring[i];
        let l = toOct(e[0]) + " " + toOct((e[1] - 2) & 0xffff) + "  " + toOct(e[2]) + "  " + e[3];
        switch (e[4]) { // Instruction format...
            case 1: // xxxxSS   Single operand
                l += " " + opr(e[1], e[2], e[5]);
                break;
            case 2: // xxSSDD   Double operand
                l += " " + opr(e[1], e[2] >>> 6, e[5]) + "," + opr(e[1], e[2], e[Math.max(5, e.length - 1)]);
                break;
            case 3: // xxxxNN   Branch
                l += " " + ((e[1] + ((e[2] & 0x80 ? e[2] | 0xff00 : e[2] & 0xff) << 1)) & 0xffff).toString(8);
                break;
            case 4: // xxxRNN   SOB with branch back
                l += " " + R[(e[2] >> 6) & 7] + "," + ((e[1] - ((e[2] & 0o77) << 1)) & 0xffff).toString(8);
                break;
            case 5: // xxxxxR   Register
                l += " " + R[(e[2] >> 6) & 7];
                break;
            case 6: // xxxRSS   Register plus operand
                l += " " + R[(e[2] >> 6) & 7] + "," + opr(e[1], e[2], e[5]);
                break;
            case 7: // xxxASS   Floating accumulator plus operand
                l += " ac" + ((e[2] >> 6) & 3) + "," + opr(e[1], e[2], e[5]);
                break;
            default:
                if (e[4] & 0x100) { // xxxNNN   Literal value in instruction - eg SPL, CC codes, Mark, etc
                    l += " " + (e[2] & (e[4] & 0xff)).toString(8);
                }
        }
        console.log(l);
    }
    return "";
}

// Adds PC word to current debug log entry - eg the x in 'MOV #x,R5'
function LOG_OPERAND(pcWord) {
    "use strict";
    if (log.limit) {
        log.ring[log.ring.length - 1].push(pcWord);
    }
}

// Add an intruction log debug entry
function LOG_INSTRUCTION(instruction, name, format) {
    "use strict";
    if (log.limit) { // Only do debug stuff if there is a log limit
        log.ring.push([readPSW(), CPU.registerVal[7], instruction, name, format]);
        while (log.ring.length > log.limit) {
            log.ring.shift();
        }
        if (CPU.registerVal[7] - 2 == log.debugPC) { // Set browser breakpoint here to stop at debug PC
            console.log(readPSW().toString(8) + " " + CPU.registerVal[7].toString(8) + " " + instruction.toString(8) + " " + name);
        }
    }
}

// Interrupts are stored in a queue in delay order with the delay expressed as
// a difference. For example if the delays were 0, 1, 0 then the first entry
// is active and both the second and third are waiting for one more instruction
// cycle to become active (which then trap when the CPU has a lower priority).
// If the current runState is WAIT then skip any delay and go straight to RUN.
// Note: Delay represents a number of instructions to execute before allowing an
// interrupt to become active. Nice idea to handle any problematic code which was
// written to know that a device could not interrupt immediately. However I don't
// think I have yet encountered this situation and perhaps the concept is a waste.
// Update: Instruction delays in the RK11 driver are required to make DOS 9 work.
// It contains code which initiates I/O to overwrite itself, and then relies on
// the I/O delay to continue executing for a short time.

function interrupt(delay, priority, vector, unit, callback, callarg) {
    "use strict";
    var i;
    if (typeof callback === "undefined") {
        callback = null;
    }
    for (i = CPU.interruptQueue.length; --i >= 0;) { // Remove any matching entries
        if (CPU.interruptQueue[i].vector === vector && (unit < 0 || CPU.interruptQueue[i].unit === unit)) {
            if (i > 0) {
                CPU.interruptQueue[i - 1].delay += CPU.interruptQueue[i].delay;
            }
            CPU.interruptQueue.splice(i, 1);
            break;
        }
    }
    if (delay >= 0) { // Delay below 0 doesn't create queue entry
        for (i = CPU.interruptQueue.length; --i >= 0;) {
            if (CPU.interruptQueue[i].delay > delay) {
                CPU.interruptQueue[i].delay -= delay;
                break;
            }
            delay -= CPU.interruptQueue[i].delay;
        }
        CPU.interruptQueue.splice(i + 1, 0, {
            "delay": CPU.runState === STATE_WAIT ? 0 : delay,
            "priority": priority & 0xe0,
            "vector": vector,
            "unit": unit < 0 ? 0 : unit,
            "callback": callback,
            "callarg": callarg
        });
        if (delay > 0 || (priority & 0xe0) > (CPU.PSW & 0xe0)) {
            CPU.priorityReview = 1; // Schedule an interrupt priority review if required
        }
        if (CPU.runState === STATE_WAIT) { // if currently in wait then resume
            CPU.runState = STATE_RUN;
            emulate(); // Kick start processor
        }
    }
}


// When a wait instruction is executed do a search through the interrupt list
// to see if we can run something (anything!) which has been delayed. If there is
// something to execute then we don't actually need to enter WAIT state.

function interruptWaitRelease() {
    "use strict";
    for (let i = CPU.interruptQueue.length; --i >= 0;) {
        CPU.interruptQueue[i].delay = 0;
        if (CPU.interruptQueue[i].priority > (CPU.PSW & 0xe0)) {
            CPU.priorityReview = 1;
            return 1; // Found something to run
        }
    }
    return 0; // No candidates found for WAIT release
}


// When the PSW, PIR or interrupt queue state have changed then it is time to review
// the list of pending interrupts to see if we can invoke one. If nothing changes
// then further reviews are not required until something does change. Changes include
// any delay decrement.
// Review is triggered by the flag CPU.priorityReview
// Interrupt callbacks allow custom device code to be called which can do special
// device handling - such as chaining RK11 seek interrupts. A callback will also return
// a flag to indicate whether the interrupt is still required - as will happen when
// the device interupt flag is reset while waiting for the interrupt to occur.
// However this quickly gets more complicated than desired! :-( Callbacks can themselves
// interact with the interrupt queue by deleting or creating new entries - breaking the
// loop to review the queue! As a result the loop count i can be thrown completely out of
// whack when a callback is encountered - which requires that the review loop be restarted
// from scratch! To re-find the queue entry containing the callback it must be marked before
// callback - here using a delay of -1, so that it can be found again (if it is even
// still in the queue). When re-encountered it will be deleted or the callback removed
// as determined by activeFlag.
// Sigh!

function interruptReview() {
    "use strict";
    var highPriority, high, i, activeFlag;
    CPU.priorityReview = 0;
    high = -1;
    highPriority = CPU.PIR & 0xe0;
    for (i = CPU.interruptQueue.length; --i >= 0;) {
        if (CPU.interruptQueue[i].delay > 0) { // If delay then all following entries are also delayed
            CPU.interruptQueue[i].delay--; // Decrement one delay 'difference' per cycle
            CPU.priorityReview = 1;
            break; // End of loop when we hit delayed items
        }
        if (CPU.interruptQueue[i].callback) { // If there a callback associated with interrupt then process it..
            if (CPU.interruptQueue[i].delay < 0) { // If it is one we marked earlier delete entry or remove callback
                if (!activeFlag) {
                    CPU.interruptQueue.splice(i, 1); // No longer required - delete it
                    high--;
                    continue;
                }
                CPU.interruptQueue[i].delay = 0;
                CPU.interruptQueue[i].callback = null;
            } else { // Before calling callback mark it with a delay of -1 so we can re-find it later
                CPU.interruptQueue[i].delay = -1;
                activeFlag = CPU.interruptQueue[i].callback(CPU.interruptQueue[i].callarg); // Remember result
                high = -1; // Restart loop from the beginning.... because the callback may modify the queue
                highPriority = CPU.PIR & 0xe0;
                i = CPU.interruptQueue.length;
                continue;
            }
        }
        if (CPU.interruptQueue[i].priority > highPriority) { // Is this the new highest priority interrupr?
            highPriority = CPU.interruptQueue[i].priority & 0xe0;
            high = i;
        }
    }
    if (highPriority > (CPU.PSW & 0xe0)) { // Check if we found an interrupt to service
        if (high < 0) {
            trap(0o240, 0x00); // Trap 240 - 0x00 PIR trap
        } else {
            trap(CPU.interruptQueue[high].vector, 0x00); // Device trap - 0x00 BR trap
            CPU.interruptQueue.splice(high, 1);
        }
    }
}

function setMMUmode(mmuMode) {
    "use strict";
    CPU.mmuMode = mmuMode;
}


// writePSW() is used to update the CPU Processor Status Word. The PSW should generally
// be written through this routine so that changes can be tracked properly, for example
// the correct register set, the current memory management mode, etc. An exception is
// SPL which writes the priority directly. Note that that N, Z, V, and C flags are
// actually stored separately to the PSW (CPU.PSW) for performance reasons, in CPU.flagN,
// CPU.flagZ, CPU.flagV, and CPU.flagC. Also CPU.mmuMode mirrors the current processor
// mode in bits 14 & 15 of the PSW, except when being manipulated by instructions which
// work across modes (MFPD, MFPI, MTPD, MTPI, and function trap()).
//
// CPU.PSW    15 14 13 12 11 10  9  8  7  6  5  4  3  2  1  0
//              CM |  PM |RS|        |PRIORITY| T| N| Z| V| C
// mode 0 kernel 1 super 2 illegal 3 user

function writePSW(newPSW) {
    "use strict";
    newPSW &= 0xf8ff;
    if ((newPSW ^ CPU.PSW) & 0x0800) { // register set change?
        for (let i = 0; i <= 5; i++) {
            let temp = CPU.registerVal[i];
            CPU.registerVal[i] = CPU.registerAlt[i];
            CPU.registerAlt[i] = temp; // swap the active register sets
        }
    }
    setMMUmode(newPSW >>> 14); // must always reset mmuMode
    if ((newPSW ^ CPU.PSW) & 0xc000) { // mode change?
        CPU.stackPointer[(CPU.PSW >>> 14) & 3] = CPU.registerVal[6];
        CPU.registerVal[6] = CPU.stackPointer[CPU.mmuMode]; // swap to new mode SP
    }
    if ((newPSW & 0xe0) < (CPU.PSW & 0xe0)) { // priority lowered?
        CPU.priorityReview = 1; // trigger check of priority levels
    }
    CPU.PSW = newPSW;
    CPU.flagN = newPSW << 12; // Extract PSW flags into external fields
    CPU.flagZ = (~newPSW) & 4;
    CPU.flagV = newPSW << 14;
    CPU.flagC = newPSW << 16;
}

function testN() { // Test N
    "use strict";
    return CPU.flagN & 0x8000;
}

function testZ() { // Test Z
    "use strict";
    return !(CPU.flagZ & 0xffff);
}

function testV() { // Test V
    "use strict";
    return CPU.flagV & 0x8000;
}

function testC() { // Test C
    "use strict";
    return CPU.flagC & 0x10000;
}

function testNxV() { // Test N xor V
    " use strict";
    return (CPU.flagN ^ CPU.flagV) & 0x8000;
}

// readPSW() reassembles the  N, Z, V, and C flags back into the PSW (CPU.PSW)

function readPSW() {
    "use strict";
    var flags = 0;
    if (testN()) {
        flags |= 8;
    }
    if (testZ()) {
        flags |= 4;
    }
    if (testV()) {
        flags |= 2;
    }
    if (testC()) {
        flags |= 1;
    }
    return (CPU.PSW = (CPU.PSW & 0xf8f0) | flags);
}

// All condition setting code abstracted from instruction routines to here
// (to enable experimentation with other approaches).

function setFlags(mask, value) { // Set or clear selected flags in mask
    "use strict";
    if (mask & 8) {
        CPU.flagN = value << 12;
    }
    if (mask & 4) {
        CPU.flagZ = (~value) & 4;
    }
    if (mask & 2) {
        CPU.flagV = value << 14;
    }
    if (mask & 1) {
        CPU.flagC = value << 16;
    }
}

function zeroNZVC() { // Set flags for 0 value (Z becomes 1)
    "use strict";
    CPU.flagN = CPU.flagZ = CPU.flagV = CPU.flagC = 0;
}

function setNZ(result) { // Set N & Z clearing V (C unchanged)
    "use strict";
    CPU.flagN = CPU.flagZ = result;
    CPU.flagV = 0;
}

function setNZV(result, flagV) { // Set N, Z & V (C unchanged)
    "use strict";
    CPU.flagN = CPU.flagZ = result;
    CPU.flagV = flagV;
}

function setNZC(result) { // Set N, Z & C clearing V
    "use strict";
    CPU.flagN = CPU.flagZ = CPU.flagC = result;
    CPU.flagV = 0;
}

function setNZVC(result, flagV) { // Set all flag conditions
    "use strict";
    CPU.flagN = CPU.flagZ = CPU.flagC = result;
    CPU.flagV = flagV;
}

function setByteNZ(result) { // Set N & Z clearing V (C unchanged) (byte)
    "use strict";
    CPU.flagN = CPU.flagZ = result << 8;
    CPU.flagV = 0;
}

function setByteNZV(result, flagV) { // Set N, Z & V (C unchanged) (byte)
    "use strict";
    CPU.flagN = CPU.flagZ = result << 8;
    CPU.flagV = flagV << 8;
}

function setByteNZC(result) { // Set N, Z & C clearing V (byte)
    "use strict";
    CPU.flagN = CPU.flagZ = CPU.flagC = result << 8;
    CPU.flagV = 0;
}

function setByteNZVC(result, flagV) { // Set all flag conditions (byte)
    "use strict";
    CPU.flagN = CPU.flagZ = CPU.flagC = result << 8;
    CPU.flagV = flagV << 8;
}



// trap() handles all the trap/abort functions. It reads the trap vector from kernel
// D space, changes mode to reflect the new PSW and PC, and then pushes the old PSW and
// PC onto the new mode stack. trap() returns a -1 which is passed up through function
// calls to indicate that a trap/abort has occurred (to terminate the current instruction)
// CPU.trapPSW records the first PSW for double trap handling. The special value of -2
// allows console operations to propagate an abort without trapping to the new vector.

function trap(vector, errorMask) {
    "use strict";
    var newPC, newPSW, doubleTrap = 0;
    if (CPU.trapPSW > -2) { // console mode doesn't actually do all the regular trap stuff
        if (CPU.trapPSW < 0) {
            CPU.trapMask = 0; // No other traps unless we cause one here
            CPU.trapPSW = readPSW(); // Remember original PSW
        } else {
            if (!CPU.mmuMode) {
                vector = 4;
                doubleTrap = 1;
            }
        }
        //LOG_INSTRUCTION(vector, "-trap-", 0x1ff);
        if (!(CPU.MMR0 & 0xe000)) {
            CPU.MMR1 = 0xf6f6;
            CPU.MMR2 = vector;
        }
        setMMUmode(0); // read from kernel D space (mode 0)
        if ((newPC = readWordByVirtual(vector | 0x10000)) >= 0) {
            if ((newPSW = readWordByVirtual(((vector + 2) & 0xffff) | 0x10000)) >= 0) {
                writePSW((newPSW & 0xcfff) | ((CPU.trapPSW >>> 2) & 0x3000)); // set new CPU.PSW with previous mode
                if (doubleTrap) {
                    CPU.CPU_Error |= 4; // Double trap treated as red zone error
                    CPU.registerVal[6] = 4; // Reset stack
                }
                if (pushWord(CPU.trapPSW, doubleTrap) >= 0 && pushWord(CPU.registerVal[7], doubleTrap) >= 0) {
                    CPU.registerVal[7] = newPC;
                }
            }
        }
        CPU.trapPSW = -1; // reset flag that we have a trap within a trap
    }
    if (errorMask) { // Check if this trap sets any CPU error flags
        CPU.displayPhysical |= 0x400000; // All CPU error flags set ADRS ERR light
        CPU.CPU_Error |= errorMask & 0xfc;
    }
    return -1; // signal that a trap has occurred
}

// Functions to read and write memory by a 22 bit physical address

function readWordByPhysical(physicalAddress) {
    "use strict";
    if (physicalAddress < IOBASE_UNIBUS) {
        return CPU.memory[physicalAddress >>> 1];
    } else {
        return access_iopage(physicalAddress, -1, 0);
    }
}

function writeWordByPhysical(physicalAddress, data) {
    "use strict";
    if (physicalAddress < IOBASE_UNIBUS) {
        CPU.memory[physicalAddress >>> 1] = data;
        return 0;
    } else {
        return access_iopage(physicalAddress, data, 0);
    }
}

function readByteByPhysical(physicalAddress) {
    "use strict";
    if (physicalAddress < IOBASE_UNIBUS) {
        if (physicalAddress & 1) {
            return CPU.memory[physicalAddress >>> 1] >>> 8;
        } else {
            return CPU.memory[physicalAddress >>> 1] & 0xff;
        }
    } else {
        return access_iopage(physicalAddress, -1, 1);
    }
}

function writeByteByPhysical(physicalAddress, data) {
    "use strict";
    if (physicalAddress < IOBASE_UNIBUS) {
        let memoryIndex = physicalAddress >>> 1;
        if (physicalAddress & 1) {
            CPU.memory[memoryIndex] = (data << 8) | (CPU.memory[memoryIndex] & 0xff);
        } else {
            CPU.memory[memoryIndex] = (CPU.memory[memoryIndex] & 0xff00) | data;
        }
        return 0;
    } else {
        return access_iopage(physicalAddress, data, 1);
    }
}

// mapVirtualToPhysical() does memory management by converting a 17 bit I/D virtual
// address to a 22 bit physical address.
// A real PDP 11/70 memory management unit can be enabled separately for read and
// write for diagnostic purposes. This is handled here by having by having an
// enable mask (CPU.mmuEnable) which is tested against the operation access mask
// (accessMask). If there is no match then the virtual address is simply mapped
// as a 16 bit physical address with the upper page going to the IO address space.
// Access bit mask values are MMU_READ and MMU_WRITE with the lower 4 bits contaning
// the operand length; used for auto-increment calculation and to indicate byte mode
// access.
//
// As an aside it turns out that it is the memory management unit that does odd address
// and non-existent memory trapping for main memory: who knew? :-) I thought these would
// have been handled at access time similar to IO page accesses.
//
// When doing mapping CPU.mmuMode selects which address space is to be used:
// 0 = kernel, 1 = supervisor, 2 = illegal, 3 = user. Normally CPU.mmuMode is
// set by the writePSW() function but there are exceptions for instructions which
// move data between address spaces (MFPD, MFPI, MTPD, and MTPI), and function trap().
// These will modify CPU.mmuMode outside of writePSW() and then restore it again if
// all worked. If however something happens to cause a trap then no restore is done
// as writePSW() will have been invoked as part of the trap to resynchronize the
// value of CPU.mmuMode
//
// A PDP 11/70 is different to other PDP 11's in that the highest 18 bit space (017000000
// & above) map directly to unibus space - including low memory. This doesn't appear to
// be particularly useful as it restricts maximum system memory size - however it does
// allow software testing of the unibus map. This feature also appears to confuse some
// OSes which test consecutive memory locations to find maximum memory - and on a full
// memory system find themselves accessing low memory again at high addresses.
//
// 15 | 14 | 13 | 12 | 11 | 10 | 9 | 8 | 7 | 6 | 5 | 4 | 3 | 2 | 1 | 0 MMR0
//nonr leng read trap unus unus ena mnt cmp  -mode- i/d  --page--   enable
//
// Map a 17 bit I/D virtual address to a 22 bit physical address

function mapVirtualToPhysical(virtualAddress, accessMask) {
    "use strict";
    var physicalAddress;
    CPU.displayAddress = virtualAddress; // Remember virtual address for display purposes
    if (!(accessMask & CPU.mmuEnable)) { // This access does not require the MMU
        physicalAddress = virtualAddress & 0xffff; // virtual address without MMU is 16 bit (no I&D)
        if (physicalAddress >= IOBASE_VIRT) {
            physicalAddress |= IOBASE_22BIT;
        } else { // no max_memory check in 16 bit mode
            if ((physicalAddress & 1) && !(accessMask & MMU_BYTE)) { // odd address check
                return trap(0o4, 0x40); // Trap 4 - 0x40 Odd address error
            }
        }
    } else { // This access is mapped by the MMU
        let page = (CPU.mmuMode << 4) | (virtualAddress >>> 13);
        if (page & 0x8 && !((CPU.MMR3KSxU << CPU.mmuMode) & 0x8)) { // If in D space and not enabled
            page &= 0x37; // Use I space unless D space enabled
        }
        physicalAddress = (CPU.mmuPAR[page] + (virtualAddress & 0x1fff)) & 0x3fffff;
        if (!(CPU.MMR3 & 0x10)) { // 18 bit mapping needs extra trimming
            physicalAddress &= 0x3ffff;
            if (physicalAddress >= IOBASE_18BIT) {
                physicalAddress |= IOBASE_22BIT;
            }
        }
        if (physicalAddress < MAX_MEMORY) { // Ordinary memory space only needs an odd address check
            if ((physicalAddress & 1) && !(accessMask & MMU_BYTE)) {
                return trap(0o4, 0x40); // Trap 4 - 0x40 Odd address error
            }
            CPU.mmuLastPage = page;
        } else { // Higher addresses may require unibus mapping and a check if non-existent
            if (physicalAddress < IOBASE_22BIT) {
                if (physicalAddress >= IOBASE_UNIBUS) {
                    physicalAddress = mapUnibus(physicalAddress & 0x3ffff); // 18bit unibus space
                    if (physicalAddress >= MAX_MEMORY && physicalAddress < IOBASE_22BIT) {
                        return trap(0o4, 0x10); // Trap 4 - 0x10 Unibus time-out - KB11-EM does this after ABORT handling - KB11-CM before
                    }
                } else {
                    return trap(0o4, 0x20); // Trap 4 - 0x20 Non-existent main memory
                }
            }
            if (CPU.mmuMode || (physicalAddress !== 0x3fff7a)) { // MMR0 is 017777572 and doesn't affect MMR0 bits
                CPU.mmuLastPage = page;
            }
        }
        let errorMask = 0;
        let pdr = CPU.mmuPDR[page];
        switch (pdr & 0x7) { // Check the Access Control Field (ACF) - really a page type
            case 1: // read-only with trap
                errorMask = 0x1000; // MMU trap - then fall thru
            case 2: // read-only
                CPU.mmuPDR[page] |= 0x80; // Set A bit
                if (accessMask & MMU_WRITE) {
                    errorMask = 0x2000; // read-only abort
                }
                break;
            case 4: // read-write with read-write trap
                errorMask = 0x1000; // MMU trap - then fall thru
            case 5: // read-write with write trap
                if (accessMask & MMU_WRITE) {
                    errorMask = 0x1000; // MMU trap - then fall thru
                }
            case 6: // read-write
                CPU.mmuPDR[page] |= ((accessMask & MMU_WRITE) ? 0xc0 : 0x80); // Set A & W bits
                break;
            default:
                errorMask = 0x8000; // non-resident abort
                break;
        }
        if (pdr & 0x8) { // Page expands downwards
            if ((pdr &= 0x7f00)) { // If a length to check
                if (((virtualAddress << 2) & 0x7f00) < pdr) {
                    errorMask |= 0x4000; // page length error abort
                }
            }
        } else { // Page expand upwards
            if ((pdr &= 0x7f00) !== 0x7f00) { // If length not maximum check it
                if (((virtualAddress << 2) & 0x7f00) > pdr) {
                    errorMask |= 0x4000; // page length error abort
                }
            }
        }
        // aborts and traps: log FIRST trap and MOST RECENT abort
        if (errorMask) {
            if (errorMask & 0xe000) {
                if (CPU.trapPSW >= 0) {
                    errorMask |= 0x80; // Instruction complete
                }
                if (!(CPU.MMR0 & 0xe000)) {
                    CPU.MMR0 |= errorMask | (CPU.mmuLastPage << 1);
                }
                return trap(0o250, 0x01); // Trap 250 - 0x00 MMU trap and Set ADRS ERR light 0x01
            }
            if (!(CPU.MMR0 & 0xf000)) {
                if (physicalAddress < 0x3ff480 || physicalAddress > 0x3fffbf) { // 017772200 - 017777677
                    CPU.MMR0 |= 0x1000; // MMU trap flag
                    if (CPU.MMR0 & 0x0200) {
                        CPU.trapMask |= 2; // MMU trap
                    }
                }
            }
        }
    }
    return (CPU.displayPhysical = physicalAddress);
}

function readWordByVirtual(virtualAddress) { // input address is 17 bit (I&D)
    "use strict";
    var physicalAddress;
    if ((physicalAddress = mapVirtualToPhysical(virtualAddress, MMU_WORD_READ)) < 0) {
        return physicalAddress;
    }
    return readWordByPhysical(physicalAddress);
}

function writeWordByVirtual(virtualAddress, data) { // input address is 17 bit (I&D)
    "use strict";
    var physicalAddress;
    if ((physicalAddress = mapVirtualToPhysical(virtualAddress, MMU_WORD_WRITE)) < 0) {
        return physicalAddress;
    }
    return writeWordByPhysical(physicalAddress, data);
}

// Stack limit checks only occur for Kernel mode and are either a yellow warning trap
// after instruction completion, or a red abort which stops the current instruction.

function stackCheck(virtualAddress) {
    "use strict";
    if (!CPU.mmuMode) { // Kernel mode 0 checking only
        if (virtualAddress <= CPU.stackLimit || virtualAddress >= 0xfffe) {
            if (virtualAddress + 32 <= CPU.stackLimit || virtualAddress >= 0xfffe) {
                CPU.registerVal[6] = 4; // Reset SP
                return trap(0o4, 0x04); // Trap 4 - 0x04 Red zone stack limit
            }
            CPU.trapMask |= 4; // Yellow zone stack limit
        }
    }
    return virtualAddress;
}

function pushWord(data, skipLimitCheck) {
    "use strict";
    var virtualAddress;
    virtualAddress = CPU.registerVal[6] = (CPU.registerVal[6] - 2) & 0xffff; // BSD meeds SP updated before any fault :-(
    if (!(CPU.MMR0 & 0xe000)) {
        CPU.MMR1 = (CPU.MMR1 << 8) | 0xf6;
    }
    if (!skipLimitCheck) {
        if ((virtualAddress = stackCheck(virtualAddress)) < 0) {
            return virtualAddress;
        }
    }
    return writeWordByVirtual(virtualAddress | 0x10000, data);
}

function popWord() {
    "use strict";
    var data;
    if ((data = readWordByVirtual(CPU.registerVal[6] | 0x10000)) >= 0) {
        CPU.registerVal[6] = (CPU.registerVal[6] + 2) & 0xffff;
    }
    return data;
}


// getVirtualByMode() maps a six bit instruction operand to a 17 bit I/D virtual
// address space. Instruction operands are six bits in length - three bits for the
// mode and three for the register. The 17th I/D bit in the resulting virtual
// address represents whether the reference is to Instruction space or Data space,
// which depends on the combination of the operand mode and whether the register is
// the Program Counter (register 7).
//
// The eight instruction addressing modes are:-
//      0   R           no valid virtual address (error)
//      1   (R)         operand from I/D depending if R = 7
//      2   (R)+        operand from I/D depending if R = 7
//      3   @(R)+       address from I/D depending if R = 7 and operand is from D space
//      4   -(R)        operand from I/D depending if R = 7
//      5   @-(R)       address from I/D depending if R = 7 and operand is from D space
//      6   x(R)        x from I space but operand from D space
//      7   @x(R)       x from I space but address and operand from D space
//
// Kernel mode stack limit checks are implemented for addressing modes 1, 2, 4 & 6 (!)
//
// The accessMode field specifies two bit flags for read or write, or both for a modify.
// Mask values for these are constants MMU_READ and MMU_WRITE which are used by the MMU
// to indicate the data access type (determines whether page access is allowed, whether to
// mark the page as modified, etc).
// In addition the lower four bits specify the operand length. This is 1 for a byte
// or 2 for a word - however the FPP processor may also use lengths of 4 or 8. Thus if
// autoincrement is used for an FPP double word the register will autoincrement by 8.
// The length component is always required here for autoincrement/decrement, but the
// MMU_READ and MMU_WRITE flags are not required if no operand access is intended
// (eg getting the destination address for a JSR instruction jump or locating the virtual
// address of a FPP operand).
//
// Just to keep us on our toes the mode (PC)+ (immediate mode, octal 27) ALWAYS increments
// by 2 no matter what type of operand is used, and SP is never incremented or decremented
// by odd (byte) amounts.
//
// Also CPU.MMR1 must be updated to track which registers have been incremented and
// decremented. This allows software to backout any changes and restart an instruction
// when a page fault occurs.
//
// Convert a six bit instruction operand to a 17 bit I/D virtual address

function getVirtualByMode(addressMode, accessMode) {
    "use strict";
    var virtualAddress, autoIncrement, reg = addressMode & 7;
    switch ((addressMode >>> 3) & 7) {
        case 0: // Mode 0: Registers don't have a virtual address so trap!
            return trap(0o4, 0x00); // Trap 4 - 0x00 Illegal addressing mode
        case 1: // Mode 1: (R)
            virtualAddress = CPU.registerVal[reg];
            switch (reg) {
                case 6: // (SP)
                    if (accessMode & MMU_WRITE) {
                        if ((virtualAddress = stackCheck(virtualAddress)) < 0) {
                            return virtualAddress;
                        }
                    }
                    virtualAddress |= 0x10000; // Use D space for stack
                    break;
                case 7: // (PC)
                    break;
                default: // (Rx)
                    virtualAddress |= 0x10000; // Use D space
                    break;
            }
            return virtualAddress;
        case 2: // Mode 2: (R)+ including immediate operand #x
            virtualAddress = CPU.registerVal[reg];
            switch (reg) {
                case 6: // (SP)+
                    autoIncrement = (accessMode + 1) & MMU_LENGTH_EVEN;
                    if (accessMode & MMU_WRITE) {
                        if ((virtualAddress = stackCheck(virtualAddress)) < 0) {
                            return virtualAddress;
                        }
                    }
                    virtualAddress |= 0x10000; // Use D space for (SP)+
                    break;
                case 7: // (PC)+  AKA  #x in I space
                    autoIncrement = 2; // R7 always increments by 2
                    break;
                default: // (Rx)+
                    autoIncrement = accessMode & MMU_LENGTH_MASK;
                    virtualAddress |= 0x10000; // Use D space
                    break;
            }
            break;
        case 3: // Mode 3: @(R)+
            if (reg === 7) {
                virtualAddress = CPU.registerVal[reg];
            } else {
                virtualAddress = CPU.registerVal[reg] | 0x10000; // Use D space if not R7
            }
            if ((virtualAddress = readWordByVirtual(virtualAddress)) < 0) {
                return virtualAddress;
            }
            //if (reg === 7) {
            //    LOG_OPERAND(virtualAddress);
            //}
            autoIncrement = 2;
            virtualAddress |= 0x10000; // Use D space
            break;
        case 4: // Mode 4: -(R)
            switch (reg) {
                case 6: // -(SP)
                    autoIncrement = -((accessMode + 1) & MMU_LENGTH_EVEN);
                    virtualAddress = (CPU.registerVal[reg] + autoIncrement) & 0xffff;
                    if (accessMode & MMU_WRITE) {
                        if ((virtualAddress = stackCheck(virtualAddress)) < 0) {
                            return virtualAddress;
                        }
                    }
                    virtualAddress |= 0x10000; // Use D space for -(SP)
                    break;
                case 7: // -(PC)  how you would use that?
                    autoIncrement = -2; // R7 always decrements by 2
                    virtualAddress = (CPU.registerVal[reg] - 2) & 0xffff;
                    break;
                default: // -(Rx)
                    autoIncrement = -(accessMode & MMU_LENGTH_MASK);
                    virtualAddress = ((CPU.registerVal[reg] + autoIncrement) & 0xffff) | 0x10000;
                    break;
            }
            break;
        case 5: // Mode 5: @-(R)
            if (reg === 7) {
                virtualAddress = (CPU.registerVal[reg] - 2) & 0xffff;
            } else {
                virtualAddress = ((CPU.registerVal[reg] - 2) & 0xffff) | 0x10000; // Use D space if not R7
            }
            if ((virtualAddress = readWordByVirtual(virtualAddress)) < 0) {
                return virtualAddress;
            }
            autoIncrement = -2;
            virtualAddress |= 0x10000; // Use D space
            break;
        case 6: // Mode 6: d(R)
            if ((virtualAddress = readWordByVirtual(CPU.registerVal[7])) < 0) { // Always I space
                return virtualAddress;
            }
            //LOG_OPERAND(virtualAddress);
            CPU.registerVal[7] = (CPU.registerVal[7] + 2) & 0xffff;
            virtualAddress = (virtualAddress + CPU.registerVal[reg]) & 0xffff;
            if (reg === 6 && (accessMode & MMU_WRITE)) {
                if ((virtualAddress = stackCheck(virtualAddress)) < 0) {
                    return virtualAddress;
                }
            }
            return virtualAddress | 0x10000;
        default: // 7 Mode 7: @d(R)
            if ((virtualAddress = readWordByVirtual(CPU.registerVal[7])) < 0) { // Always I space
                return virtualAddress;
            }
            //LOG_OPERAND(virtualAddress);
            CPU.registerVal[7] = (CPU.registerVal[7] + 2) & 0xffff;
            virtualAddress = (virtualAddress + CPU.registerVal[reg]) & 0xffff;
            if ((virtualAddress = readWordByVirtual(virtualAddress | 0x10000)) < 0) {
                return virtualAddress;
            }
            return virtualAddress | 0x10000; // @x
    }
    CPU.registerVal[reg] = (CPU.registerVal[reg] + autoIncrement) & 0xffff;
    if (!(CPU.MMR0 & 0xe000)) {
        CPU.MMR1 = (CPU.MMR1 << 8) | ((autoIncrement << 3) & 0xf8) | reg;
    }
    return virtualAddress;
}



// Convert an instruction operand into a 17 bit I/D virtual address and then into a
// 22 bit physical address.
// Note: attempting to get the physical address of a register is an error!

function mapPhysicalByMode(addressMode, accessMode) {
    "use strict";
    var virtualAddress;
    if ((virtualAddress = getVirtualByMode(addressMode, accessMode)) < 0) {
        return virtualAddress;
    }
    return mapVirtualToPhysical(virtualAddress, accessMode);
}

function readWordByMode(addressMode) {
    "use strict";
    if (!(addressMode & 0o70)) { // If register mode just get register value
        return CPU.registerVal[addressMode & 7];
    } else {
        let physicalAddress;
        if ((physicalAddress = mapPhysicalByMode(addressMode, MMU_WORD_READ)) < 0) {
            return physicalAddress;
        }
        return readWordByPhysical(physicalAddress);
        //if ((addressMode & 0o77) == 0o27) {
        //    LOG_OPERAND(data);
        //}
    }
}

function writeWordByMode(addressMode, data) {
    "use strict";
    if (!(addressMode & 0o70)) { // If register mode write to the register
        CPU.registerVal[addressMode & 7] = data & 0xffff;
        return 0;
    } else {
        let physicalAddress;
        if ((physicalAddress = mapPhysicalByMode(addressMode, MMU_WORD_WRITE)) < 0) {
            return physicalAddress;
        }
        return writeWordByPhysical(physicalAddress, data & 0xffff);
    }
}

function modifyWordByMode(addressMode) {
    "use strict";
    if (!(addressMode & 0o70)) { // If register mode get register value and remember which register
        CPU.modifyRegister = addressMode & 7;
        return CPU.registerVal[CPU.modifyRegister];
    } else {
        let physicalAddress;
        if ((physicalAddress = mapPhysicalByMode(addressMode, MMU_WORD_MODIFY)) < 0) {
            return physicalAddress;
        }
        CPU.modifyRegister = -1;
        CPU.modifyAddress = physicalAddress; // Remember physical address for modify
        return readWordByPhysical(physicalAddress);
    }
}

function modifyWord(data) {
    "use strict";
    if (CPU.modifyRegister >= 0) { // Modify the last register or memory address accessed
        CPU.registerVal[CPU.modifyRegister] = data & 0xffff;
        return 0;
    } else {
        return writeWordByPhysical(CPU.modifyAddress, data & 0xffff);
    }
}

function readByteByMode(addressMode) {
    "use strict";
    if (!(addressMode & 0o70)) { // If register mode just get register value
        return CPU.registerVal[addressMode & 7] & 0xff;
    } else {
        let physicalAddress;
        if ((physicalAddress = mapPhysicalByMode(addressMode, MMU_BYTE_READ)) < 0) {
            return physicalAddress;
        }
        return readByteByPhysical(physicalAddress);
        //if ((addressMode & 0o77) == 0o27) {
        //    LOG_OPERAND(data);
        //}
    }
}

function writeByteByMode(addressMode, data) {
    "use strict";
    if (!(addressMode & 0o70)) { // If register mode write to the register
        CPU.registerVal[addressMode & 7] = (CPU.registerVal[addressMode & 7] & 0xff00) | (data & 0xff);
    } else {
        let physicalAddress;
        if ((physicalAddress = mapPhysicalByMode(addressMode, MMU_BYTE_WRITE)) < 0) {
            return physicalAddress;
        }
        return writeByteByPhysical(physicalAddress, data & 0xff);
    }
    return 0;
}

function modifyByteByMode(addressMode) {
    "use strict";
    if (!(addressMode & 0o70)) { // If register mode get register value and remember which register
        CPU.modifyRegister = addressMode & 7;
        return CPU.registerVal[CPU.modifyRegister] & 0xff;
    } else {
        let physicalAddress;
        if ((physicalAddress = mapPhysicalByMode(addressMode, MMU_BYTE_MODIFY)) < 0) {
            return physicalAddress;
        }
        CPU.modifyRegister = -1;
        CPU.modifyAddress = physicalAddress; // Remember physical address for modify
        return readByteByPhysical(physicalAddress);
    }
}

function modifyByte(data) {
    "use strict";
    if (CPU.modifyRegister >= 0) { // Modify the last register or memory address accessed
        CPU.registerVal[CPU.modifyRegister] = (CPU.registerVal[CPU.modifyRegister] & 0xff00) | (data & 0xff);
        return 0;
    } else {
        return writeByteByPhysical(CPU.modifyAddress, data & 0xff);
    }
}



// Most instruction read operations use a 6 bit instruction operand via
// a ByMode function such as readWordByMode(). A negative function
// return indicates that something has failed and a trap or abort has
// been invoked. The coding template would be:
//
//   if ((src = readWordByMode(instruction >>> 6)) >= 0) {
//         success - use the src value
//
// Likewise write operations use function writeWordByMode() to write a
// result to a register or memory and return a negative value if a failure
// occurs (non-existant memory, page fault, non-existant device, etc).
// In this case further instrucion processing should be aborted. The
// coding template is:
//
//    if (writeWordByMode(instruction, data) >= 0) {
//         continue the instruction
//
// For each Word function there are generally corresponding Byte functions,
// eg readByteByMode() - however there are no byte functions for accessing
// bytes by virtual address as they are not required.
//
// Read/Write operations require two functions to retrieve and then update
// the value. The first function requests memory mapping with modify access,
// stores the register number or physical address for the second function, then
// returns the operand. The second function simply writes the updated value
// back to the remembered location. If either function returns a negative
// value then an error condition has been encountered. The coding template
// is:
//
//    if ((dst = modifyByteByMode(instruction)) >= 0) {
//          result = some computation on dst
//          if (modifyByte(result) >= 0) {
//               continue processing
//
// Some instructions (eg JMP, JSR, MTPx..) require the address of an operand.
// The code for this would generally look like:
//
//   if ((virtualAddress = getVirtualByMode(instruction, MMU_WORD)) >= 0) {
//        do something with the address
//
// Note that in this case there is an access mode to specify the operand length
// (required for auto incremenet/decrement) but not an access type (MMU_READ or
// MMU_WRITE) as the mapping does not attempt to access the operand.
//
// CPU condition code flags are stored outside of the PSW for performance reasons. A
// call to readPSW() will assemble them back into the PSW. Writes to the PSW should
// generally be through writePSW() as it needs to track which register set is in use,
// the memory management mode, whether priority has changed etc.
// Setting and testing of condition code flags is done through function calls such
// as setNZVC() and testC() so that the implementation detail is abstracted away
// from the following instruction code (allowing alternate implementation approaches).
// Normally CPU.mmuMode mirrors the current processor mode held in bits
// 14 & 15 of the PSW as it is frequently used by memory management operations.
//
// All traps and aborts go through the trap() function. It returns a -1 value which
// is then passed up through other function layers and interpreted as an indicator
// that something has gone wrong, and that no futher processing is to be done for the
// current instruction.
//
// Instruction execution is performed by the emulate() function which processes a
// batch of instructions. The current strategy is to execute CPU.loopBase instructions
// and time how long that takes. If it is above or below 8ms then adjust CPU.loopBase
// for the next interval.
//
// Batching instructions in this way is required in Javascript as it is necessary
// to relinquish control periodically to let timer and I/O functions execute, and to
// update the console lights. Of course if JavaScript had a method for testing whether
// an event was pending then we could have structured things very differently...


function emulate() {
    "use strict";
    var instruction = 0,
        src,
        dst = 0,
        result,
        virtualAddress, reg;
    var loopCount, loopTime;
    var CPU = window.CPU;
    var registerVal = CPU.registerVal;

    // branch() calculates the branch to PC from a branch instruction offset
    function branch(instruction) {
        "use strict";
        registerVal[7] = (registerVal[7] + ((instruction & 0x80 ? instruction | 0xff00 : instruction & 0xff) << 1)) & 0xffff;
    }

    if (CPU.runState === STATE_RUN) {
        loopTime = Date.now();
        loopCount = CPU.loopBase;
    } else {
        loopTime = loopCount = 0; // CPU not running - assume instruction stepping from console
        if (CPU.runState !== STATE_HALT) {
            return;
        }
    }
    do {
        // If something has changed review priority - with a one instruction delay after SPL (!)
        if (CPU.priorityReview) {
            if (!(--CPU.priorityReview)) {
                interruptReview();
            }
        }
        // Check if previous instruction has outstanding post instruction traps
        if (CPU.trapMask) {
            if (CPU.trapMask & 2) { // MMU trap 250 has priority..
                trap(0o250, 0x01); // Trap 250 - 0x00 MMU trap and Set ADRS ERR light 0x01
            } else {
                if (CPU.trapMask & 4) { // then yellow zone..
                    trap(0o4, 0x08); // Trap 4 - 0x08 Yellow zone stack limit
                } else {
                    if (CPU.trapMask & 8) {
                        trap(0o244, 0x00); // Trap 244 - 0x00 FPP floating point exception
                    } else {
                        if (CPU.trapMask & 0x10) { // same bit as T bit trap in PSW
                            trap(0o14, 0x00); // Trap 14 - 0x00 T-bit trap
                        }
                    }
                }
            }
        }
        // At start of instruction cycle set MMR state unless it is frozen
        if (!(CPU.MMR0 & 0xe000)) {
            CPU.MMR1 = 0;
            CPU.MMR2 = registerVal[7];
        }
        // Remember if T-bit trap required at the end of this instruction
        CPU.trapMask = CPU.PSW & 0x10;
        if ((instruction = readWordByVirtual(registerVal[7])) >= 0) {
            //if (registerVal[7] === 0o26576) { // DDEEBBUUGG
            //    console.log("PC " + registerVal[7].toString(8) + " instruction: " + instruction.toString(8) + " R0: " + registerVal[0].toString(8) + " R4: " + registerVal[4].toString(8));
            //}
            registerVal[7] = (registerVal[7] + 2) & 0xffff;
            switch (instruction >>> 12) { // xxSSDD Mostly double operand instructions
                case 0: // 00xxxx mixed group
                    switch (instruction >>> 8) { // 00xxxx 8 bit instructions first (branch & JSR)
                        case 0: // 000xXX Misc zero group
                            switch (instruction >>> 6) { // 000xDD group (4 case full decode)
                                case 0: // 0000xx group
                                    switch (instruction) { // 0000xx no operands
                                        case 0: // HALT 000000
                                            //LOG_INSTRUCTION(instruction, "halt", 0);
                                            if (CPU.mmuMode) {
                                                trap(0o4, 0x80); // Trap 4 - 0x80 Illegal halt
                                            } else {
                                                CPU.runState = STATE_HALT; // halt
                                                loopCount = 0; // force exit
                                                console.log("HALT at " + registerVal[7].toString(8) + " PSW: " + readPSW().toString(8));
                                            }
                                            break;
                                        case 1: // WAIT 000001
                                            //LOG_INSTRUCTION(instruction, "wait", 0);
                                            if (!interruptWaitRelease()) {
                                                if (CPU.runState !== STATE_HALT) { // Halt means we are instruction stepping
                                                    CPU.runState = STATE_WAIT; // WAIT; // Go to wait state and exit loop
                                                }
                                                loopCount = 0; // force exit
                                            }
                                            break;
                                        case 3: // BPT  000003
                                            //LOG_INSTRUCTION(instruction, "bpt", 0);
                                            trap(0o14, 0x00); // Trap 14 - 0x00 BPT Instruction
                                            break;
                                        case 4: // IOT  000004
                                            //LOG_INSTRUCTION(instruction, "iot", 0);
                                            trap(0o20, 0x00); // Trap 20 - 0x00 IOT instruction
                                            break;
                                        case 5: // RESET 000005
                                            //LOG_INSTRUCTION(instruction, "reset", 0);
                                            if (!CPU.mmuMode) {
                                                reset_iopage();
                                                if (CPU.runState !== STATE_HALT) { // Halt means we are instruction stepping
                                                    CPU.runState = STATE_RESET; // reset state for special pause
                                                }
                                                loopCount = 0; // force exit
                                            }
                                            break;
                                        case 2: // RTI 000002
                                        case 6: // RTT 000006
                                            //LOG_INSTRUCTION(instruction, "rtt", 0);
                                            if ((result = popWord()) >= 0) { // new PC
                                                let savePSW = popWord();
                                                if (savePSW >= 0) { // new PSW
                                                    savePSW &= 0xf8ff;
                                                    if (CPU.mmuMode) { // user / super restrictions
                                                        // keep SPL and allow lower only for modes and register set
                                                        savePSW = (savePSW & 0xf81f) | (CPU.PSW & 0xf8e0);
                                                    }
                                                    registerVal[7] = result;
                                                    writePSW(savePSW);
                                                    CPU.trapMask &= ~0x10; // turn off Trace trap
                                                    if (instruction === 2) {
                                                        CPU.trapMask |= CPU.PSW & 0x10; // RTI enables immediate trace
                                                    }
                                                }
                                            }
                                            break;
                                            //case 7: // MFPT 000007
                                            //    //LOG_INSTRUCTION(instruction, "mfpt", 0);
                                            //    registerVal[0] = 1;
                                            //    break; // Exists on pdp 11/44 & KB11-EM
                                        default: // We don't know this 0000xx instruction
                                            //LOG_INSTRUCTION(instruction, "-unknown-", 0);
                                            trap(0o10, 0x00); // Trap 10 - 0x00 Illegal instruction
                                            break;
                                    }
                                    break;
                                case 1: // JMP 0001DD
                                    //LOG_INSTRUCTION(instruction, "jmp", 1);
                                    if ((virtualAddress = getVirtualByMode(instruction, MMU_WORD)) >= 0) {
                                        registerVal[7] = virtualAddress & 0xffff;
                                    }
                                    break;
                                case 2: // 00002xR single register group
                                    switch ((instruction >>> 3) & 7) { // 00002xR register or CC
                                        case 0: // RTS 00020R
                                            //LOG_INSTRUCTION(instruction, "rts", 5);
                                            if ((result = popWord()) >= 0) {
                                                reg = instruction & 7;
                                                registerVal[7] = registerVal[reg];
                                                registerVal[reg] = result;
                                            }
                                            break;
                                        case 3: // SPL 00023N
                                            //LOG_INSTRUCTION(instruction, "spl", 0x107);
                                            if (!CPU.mmuMode) {
                                                CPU.PSW = (CPU.PSW & 0xf81f) | ((instruction & 7) << 5);
                                                CPU.priorityReview = 2; // Skip next review
                                            }
                                            break;
                                        case 4: // CLR CC 00024C Part 1 without N
                                        case 5: // CLR CC 00025C Part 2 with N
                                            //LOG_INSTRUCTION(instruction, "clr", 0x10f);
                                            setFlags(instruction, 0);
                                            break;
                                        case 6: // SET CC 00026C Part 1 without N
                                        case 7: // SET CC 00027C Part 2 with N
                                            //LOG_INSTRUCTION(instruction, "set", 0x10f);
                                            setFlags(instruction, 0xf);
                                            break;
                                        default: // We don't know this 00002xR instruction
                                            //LOG_INSTRUCTION(instruction, "-unknown-", 0);
                                            trap(0o10, 0x00); // Trap 10 - 0x00 Illegal instruction
                                            break;
                                    }
                                    break;
                                case 3: // SWAB 0003DD
                                    //LOG_INSTRUCTION(instruction, "swab", 1);
                                    if ((dst = modifyWordByMode(instruction)) >= 0) {
                                        result = (dst << 8) | (dst >>> 8);
                                        if (modifyWord(result) >= 0) {
                                            setNZC(dst & 0xff00);
                                        }
                                    }
                                    break;
                            }
                            break;
                        case 1: // BR 0004 offset
                            //LOG_INSTRUCTION(instruction, "br", 3);
                            branch(instruction);
                            break;
                        case 2: // BNE 0010 offset
                            //LOG_INSTRUCTION(instruction, "bne", 3);
                            if (!testZ()) {
                                branch(instruction);
                            }
                            break;
                        case 3: // BEQ 0014 offset
                            //LOG_INSTRUCTION(instruction, "beq", 3);
                            if (testZ()) {
                                branch(instruction);
                            }
                            break;
                        case 4: // BGE 0020 offset
                            //LOG_INSTRUCTION(instruction, "bge", 3);
                            if (!testNxV()) {
                                branch(instruction);
                            }
                            break;
                        case 5: // BLT 0024 offset
                            //LOG_INSTRUCTION(instruction, "blt", 3);
                            if (testNxV()) {
                                branch(instruction);
                            }
                            break;
                        case 6: // BGT 0030 offset
                            //LOG_INSTRUCTION(instruction, "bgt", 3);
                            if (!testZ() && !testNxV()) {
                                branch(instruction);
                            }
                            break;
                        case 7: // BLE 0034 offset
                            //LOG_INSTRUCTION(instruction, "ble", 3);
                            if (testZ() || testNxV()) {
                                branch(instruction);
                            }
                            break;
                        case 8: // JSR 004RDD In two parts
                        case 9: // JSR 004RDD continued (9 bit instruction so use 2 x 8 bit slots)
                            //LOG_INSTRUCTION(instruction, "jsr", 6);
                            if ((virtualAddress = getVirtualByMode(instruction, MMU_WORD)) >= 0) {
                                reg = (instruction >>> 6) & 7;
                                if (pushWord(registerVal[reg], 0) >= 0) {
                                    registerVal[reg] = registerVal[7];
                                    registerVal[7] = virtualAddress & 0xffff;
                                }
                            }
                            break;
                        default: // Remaining 0o00xxxx instructions where xxxx >= 05000
                            switch (instruction >>> 6) { // 00xxDD
                                case 0o50: // CLR 0050DD
                                    //LOG_INSTRUCTION(instruction, "clr", 1);
                                    if (writeWordByMode(instruction, 0) >= 0) {
                                        zeroNZVC();
                                    }
                                    break;
                                case 0o51: // COM 0051DD
                                    //LOG_INSTRUCTION(instruction, "com", 1);
                                    if ((dst = modifyWordByMode(instruction)) >= 0) {
                                        result = ~dst;
                                        if (modifyWord(result) >= 0) {
                                            setNZC(result);
                                        }
                                    }
                                    break;
                                case 0o52: // INC 0052DD
                                    //LOG_INSTRUCTION(instruction, "inc", 1);
                                    if ((dst = modifyWordByMode(instruction)) >= 0) {
                                        result = dst + 1;
                                        if (modifyWord(result) >= 0) {
                                            setNZV(result, result & (result ^ dst));
                                        }
                                    }
                                    break;
                                case 0o53: // DEC 0053DD
                                    //LOG_INSTRUCTION(instruction, "dec", 1);
                                    if ((dst = modifyWordByMode(instruction)) >= 0) {
                                        result = dst + 0xffff;
                                        if (modifyWord(result) >= 0) {
                                            setNZV(result, (result ^ dst) & dst);
                                        }
                                    }
                                    break;
                                case 0o54: // NEG 0054DD
                                    //LOG_INSTRUCTION(instruction, "neg", 1);
                                    if ((dst = modifyWordByMode(instruction)) >= 0) {
                                        result = -dst;
                                        if (modifyWord(result) >= 0) {
                                            setNZVC(result, result & dst);
                                        }
                                    }
                                    break;
                                case 0o55: // ADC 0055DD
                                    //LOG_INSTRUCTION(instruction, "adc", 1);
                                    if ((dst = modifyWordByMode(instruction)) >= 0) {
                                        result = dst;
                                        if (testC()) {
                                            result++;
                                        }
                                        if (modifyWord(result) >= 0) {
                                            setNZVC(result, result & (result ^ dst));
                                        }
                                    }
                                    break;
                                case 0o56: // SBC 0056DD
                                    //LOG_INSTRUCTION(instruction, "sbc", 1);
                                    if ((dst = modifyWordByMode(instruction)) >= 0) {
                                        result = dst;
                                        if (testC()) {
                                            result--;
                                        }
                                        if (modifyWord(result) >= 0) {
                                            setNZVC(result, (result ^ dst) & dst);
                                        }
                                    }
                                    break;
                                case 0o57: // TST 0057DD
                                    //LOG_INSTRUCTION(instruction, "tst", 1);
                                    if ((result = readWordByMode(instruction)) >= 0) {
                                        setNZC(result);
                                    }
                                    break;
                                case 0o60: // ROR 0060DD
                                    //LOG_INSTRUCTION(instruction, "ror", 1);
                                    if ((dst = modifyWordByMode(instruction)) >= 0) {
                                        result = (dst << 16) | (dst >>> 1);
                                        if (testC()) {
                                            result |= 0x8000;
                                        }
                                        if (modifyWord(result) >= 0) {
                                            setNZVC(result, result ^ (result >>> 1));
                                        }
                                    }
                                    break;
                                case 0o61: // ROL 0061DD
                                    //LOG_INSTRUCTION(instruction, "rol", 1);
                                    if ((dst = modifyWordByMode(instruction)) >= 0) {
                                        result = dst << 1;
                                        if (testC()) {
                                            result |= 1;
                                        }
                                        if (modifyWord(result) >= 0) {
                                            setNZVC(result, result ^ dst);
                                        }
                                    }
                                    break;
                                case 0o62: // ASR 0062DD
                                    //LOG_INSTRUCTION(instruction, "asr", 1);
                                    if ((dst = modifyWordByMode(instruction)) >= 0) {
                                        result = (dst << 16) | (dst & 0x8000) | (dst >>> 1);
                                        if (modifyWord(result) >= 0) {
                                            setNZVC(result, result ^ (result >>> 1));
                                        }
                                    }
                                    break;
                                case 0o63: // ASL 0063DD
                                    //LOG_INSTRUCTION(instruction, "asl", 1);
                                    if ((dst = modifyWordByMode(instruction)) >= 0) {
                                        result = dst << 1;
                                        if (modifyWord(result) >= 0) {
                                            setNZVC(result, result ^ dst);
                                        }
                                    }
                                    break;
                                case 0o64: // MARK 0064nn
                                    //LOG_INSTRUCTION(instruction, "mark", 0x13f);
                                    virtualAddress = (registerVal[7] + ((instruction & 0o77) << 1)) & 0xffff;
                                    if ((result = readWordByVirtual(virtualAddress | 0x10000)) >= 0) {
                                        registerVal[7] = registerVal[5];
                                        registerVal[5] = result;
                                        registerVal[6] = (virtualAddress + 2) & 0xffff;
                                    }
                                    break;
                                case 0o65: // MFPI 0065SS
                                    //LOG_INSTRUCTION(instruction, "mfpi", 1);
                                    if (!(instruction & 0o70)) {
                                        reg = instruction & 7;
                                        if (reg !== 6 || ((CPU.PSW >>> 12) & 3) === CPU.mmuMode) {
                                            result = registerVal[reg];
                                        } else {
                                            result = CPU.stackPointer[(CPU.PSW >>> 12) & 3];
                                        }
                                        if (pushWord(result, 0) >= 0) {
                                            setNZ(result);
                                        }
                                    } else {
                                        if ((virtualAddress = getVirtualByMode(instruction, MMU_WORD)) >= 0) {
                                            if ((CPU.PSW & 0xf000) !== 0xf000) {
                                                virtualAddress &= 0xffff;
                                            }
                                            setMMUmode((CPU.PSW >>> 12) & 3); // Use PM
                                            if ((result = readWordByVirtual(virtualAddress)) >= 0) {
                                                setMMUmode((CPU.PSW >>> 14) & 3); // Restore CM
                                                if (pushWord(result, 0) >= 0) {
                                                    setNZ(result);
                                                }
                                            }
                                        }
                                    }
                                    break;
                                case 0o66: // MTPI 0066DD
                                    //LOG_INSTRUCTION(instruction, "mtpi", 1);
                                    if ((result = popWord()) >= 0) {
                                        if (!(CPU.MMR0 & 0xe000)) {
                                            CPU.MMR1 = 0o26;
                                        }
                                        if (!(instruction & 0o70)) {
                                            reg = instruction & 7;
                                            if (reg !== 6 || ((CPU.PSW >>> 12) & 3) === CPU.mmuMode) {
                                                registerVal[reg] = result;
                                            } else {
                                                CPU.stackPointer[(CPU.PSW >>> 12) & 3] = result;
                                            }
                                            setNZ(result);
                                        } else { // Must extract virtual address before mode change...
                                            if ((virtualAddress = getVirtualByMode(instruction, MMU_WORD)) >= 0) {
                                                setMMUmode((CPU.PSW >>> 12) & 3); // Use previous mode
                                                if (writeWordByVirtual(virtualAddress & 0xffff, result) >= 0) {
                                                    setMMUmode((CPU.PSW >>> 14) & 3); // Restore CM
                                                    setNZ(result);
                                                }
                                            }
                                        }
                                    }
                                    break;
                                case 0o67: // SXT 0067DD
                                    //LOG_INSTRUCTION(instruction, "sxt", 1);
                                    result = 0;
                                    if (testN()) {
                                        result = 0xffff;
                                    }
                                    if (writeWordByMode(instruction, result) >= 0) {
                                        setNZ(result);
                                    }
                                    break;
                                default: // We don't know this 0o00xxDD instruction
                                    //LOG_INSTRUCTION(instruction, "-unknown-", 0);
                                    trap(0o10, 0x00); // Trap 10 - 0x00 Illegal instruction
                                    break;
                            }
                    }
                    break;
                case 1: // MOV  01SSDD
                    //LOG_INSTRUCTION(instruction, "mov", 2);
                    if ((result = readWordByMode(instruction >>> 6)) >= 0) {
                        if (writeWordByMode(instruction, result) >= 0) {
                            setNZ(result);
                        }
                    }
                    break;
                case 2: // CMP 02SSDD
                    //LOG_INSTRUCTION(instruction, "cmp", 2);
                    if ((src = readWordByMode(instruction >>> 6)) >= 0) {
                        if ((dst = readWordByMode(instruction)) >= 0) {
                            result = src - dst;
                            setNZVC(result, (result ^ src) & (src ^ dst));
                        }
                    }
                    break;
                case 3: // BIT 03SSDD
                    //LOG_INSTRUCTION(instruction, "bit", 2);
                    if ((src = readWordByMode(instruction >>> 6)) >= 0) {
                        if ((result = readWordByMode(instruction)) >= 0) {
                            setNZ(src & result);
                        }
                    }
                    break;
                case 4: // BIC 04SSDD
                    //LOG_INSTRUCTION(instruction, "bic", 2);
                    if ((src = readWordByMode(instruction >>> 6)) >= 0) {
                        if ((dst = modifyWordByMode(instruction)) >= 0) {
                            result = dst & ~src;
                            if (modifyWord(result) >= 0) {
                                setNZ(result);
                            }
                        }
                    }
                    break;
                case 5: // BIS 05SSDD
                    //LOG_INSTRUCTION(instruction, "bis", 2);
                    if ((src = readWordByMode(instruction >>> 6)) >= 0) {
                        if ((dst = modifyWordByMode(instruction)) >= 0) {
                            result = dst | src;
                            if (modifyWord(result) >= 0) {
                                setNZ(result);
                            }
                        }
                    }
                    break;
                case 6: // ADD 06SSDD
                    //LOG_INSTRUCTION(instruction, "add", 2);
                    if ((src = readWordByMode(instruction >>> 6)) >= 0) {
                        if ((dst = modifyWordByMode(instruction)) >= 0) {
                            result = src + dst;
                            if (modifyWord(result) >= 0) {
                                setNZVC(result, (result ^ src) & (result ^ dst));
                            }
                        }
                    }
                    break;
                case 7: // 07xRSS instructions
                    switch ((instruction >>> 9) & 7) { // 07xRSS
                        case 0: // MUL 070RSS
                            //LOG_INSTRUCTION(instruction, "mul", 6);
                            if ((src = readWordByMode(instruction)) >= 0) {
                                reg = (instruction >>> 6) & 7;
                                dst = registerVal[reg];
                                if (src & 0x8000) {
                                    src -= 0x10000;
                                }
                                if (dst & 0x8000) {
                                    dst -= 0x10000;
                                }
                                result = src * dst;
                                registerVal[reg] = (result >>> 16) & 0xffff;
                                registerVal[reg | 1] = result & 0xffff;
                                result = (result >>> 16) | ((result & 0xffff) ? 1 : 0) | ((result < -32768 || result > 32767) ? 0x10000 : 0);
                                setNZC(result);
                            }
                            break;
                        case 1: // DIV 071RSS
                            //LOG_INSTRUCTION(instruction, "div", 6);
                            if ((src = readWordByMode(instruction)) >= 0) {
                                if (!src) { // divide by zero
                                    setNZVC(0x10000, 0x8000);
                                } else {
                                    reg = (instruction >>> 6) & 7;
                                    dst = (registerVal[reg] << 16) | registerVal[reg | 1];
                                    if (src & 0x8000) {
                                        src -= 0x10000;
                                    }
                                    if (dst & 0x80000000) {
                                        dst = (dst & 0x7fffffff) - 0x80000000;
                                    }
                                    result = ~~(dst / src);
                                    if (result >= -32768 && result <= 32767) {
                                        registerVal[reg] = result & 0xffff;
                                        registerVal[reg | 1] = (dst - (result * src)) & 0xffff;
                                        setNZC((result >>> 16) | (result ? 1 : 0));
                                    } else {
                                        setNZVC(((dst >>> 16) & 0x8000) | (result ? 1 : 0), 0x8000); // Bad result
                                        if (!(result & 0x7fffffff)) setFlags(4, 4); // Set zero flag
                                        if (src === -1 && registerVal[reg] === 0xfffe) {
                                            registerVal[reg] = registerVal[reg | 1] = 1;
                                        }
                                    }
                                }
                            }
                            break;
                        case 2: // ASH 072RSS
                            //LOG_INSTRUCTION(instruction, "ash", 6);
                            if ((src = readWordByMode(instruction)) >= 0) {
                                reg = (instruction >>> 6) & 7;
                                result = registerVal[reg];
                                src &= 0x3f;
                                if (!(src && result)) {
                                    setNZC(result);
                                } else {
                                    if (src & 0x20) { // ASH right (1-32)
                                        src = 64 - src; // Make into count
                                        if (src > 16) {
                                            src = 16; // Enforce limit (beyond 16 C copies sign)
                                        }
                                        dst = result >>> (src - 1); // Low bit becomes carry
                                        if (result & 0x8000) { // If sign bit 1's fill
                                            result = ((0xffff0000 | result) >>> src) & 0xffff;
                                        } else {
                                            result >>>= src;
                                        }
                                        setNZC((dst << 16) | result);
                                    } else { // ASH left (1-31)
                                        if (src > 17) {
                                            src = 17; // Enforce limit (beyond 16 C becomes 0)
                                        }
                                        result <<= src;
                                        dst = result & 0xffff8000; // Get bits shifted out plus sign
                                        if (dst && dst !== ((0xffff << src) & 0xffff8000)) { // Check bits shifted out match sign
                                            setNZVC(result, 0x8000); // Set V if not
                                        } else {
                                            setNZC(result);
                                        }
                                    }
                                    registerVal[reg] = result & 0xffff;
                                }
                            }
                            break;
                        case 3: // ASHC 073RSS
                            //LOG_INSTRUCTION(instruction, "ashc", 6);
                            if ((src = readWordByMode(instruction)) >= 0) {
                                reg = (instruction >>> 6) & 7;
                                result = (registerVal[reg] << 16) | registerVal[reg | 1];
                                src &= 0x3f;
                                if (!(src && result)) {
                                    setNZC(result >>> 16 | (result ? 1 : 0));
                                } else {
                                    if (src & 0x20) { // ASHC right (1-32)
                                        src = 64 - src; // Make into count
                                        dst = result >>> (src - 1); // Low bit becomes carry
                                        if (result & 0x80000000) { // If sign bit shift with 1's fill
                                            result = (0xffffffff << (32 - src)) | (result >>> src);
                                        } else {
                                            result >>>= src;
                                        }
                                        setNZC((dst << 16) | (result ? (result >>> 16) | 1 : 0));
                                    } else { // ASHC left (1-31)
                                        dst = result >>> (31 - src); // EQKC confirms ANY change of sign during shift sets V :-(
                                        result <<= src;
                                        if (dst && dst !== (0xffffffff >>> (31 - src))) { // Low bits are carry and sign
                                            setNZVC((dst << 15) | (result ? 1 : 0), 0x8000); // Set V if any change of sign
                                        } else {
                                            setNZC((dst << 15) | (result ? 1 : 0));
                                        }
                                    }
                                    registerVal[reg] = (result >>> 16) & 0xffff;
                                    registerVal[reg | 1] = result & 0xffff;
                                }
                            }
                            break;
                        case 4: // XOR 074RSS
                            //LOG_INSTRUCTION(instruction, "xor", 6);
                            if ((result = modifyWordByMode(instruction)) >= 0) {
                                result ^= registerVal[(instruction >>> 6) & 7];
                                if (modifyWord(result) >= 0) {
                                    setNZ(result);
                                }
                            }
                            break;
                        case 7: // SOB 077Rnn
                            //LOG_INSTRUCTION(instruction, "sob", 4);
                            reg = (instruction >>> 6) & 7;
                            if ((registerVal[reg] = ((registerVal[reg] - 1) & 0xffff))) {
                                registerVal[7] = (registerVal[7] - ((instruction & 0o77) << 1)) & 0xffff;
                            }
                            break;
                        default: // We don't know this 07xRSS instruction
                            //LOG_INSTRUCTION(instruction, "-unknown-", 0);
                            trap(0o10, 0x00); // Trap 10 - 0x00 Illegal instruction
                            break;
                    }
                    break;
                case 8: // 10xxxx instructions
                    switch ((instruction >>> 8) & 0xf) { // 10xxxx 8 bit instructions first
                        case 0: // BPL 1000 offset
                            //LOG_INSTRUCTION(instruction, "bpl", 3);
                            if (!testN()) {
                                branch(instruction);
                            }
                            break;
                        case 1: // BMI 1004 offset
                            //LOG_INSTRUCTION(instruction, "bmi", 3);
                            if (testN()) {
                                branch(instruction);
                            }
                            break;
                        case 2: // BHI 1010 offset
                            //LOG_INSTRUCTION(instruction, "bhi", 3);
                            if (!testC() && !testZ()) {
                                branch(instruction);
                            }
                            break;
                        case 3: // BLOS 1014 offset
                            //LOG_INSTRUCTION(instruction, "blos", 3);
                            if (testC() || testZ()) {
                                branch(instruction);
                            }
                            break;
                        case 4: // BVC 1020 offset
                            //LOG_INSTRUCTION(instruction, "bvc", 3);
                            if (!testV()) {
                                branch(instruction);
                            }
                            break;
                        case 5: // BVS 1024 offset
                            //LOG_INSTRUCTION(instruction, "bvs", 3);
                            if (testV()) {
                                branch(instruction);
                            }
                            break;
                        case 6: // BCC 1030 offset
                            //LOG_INSTRUCTION(instruction, "bcc", 3);
                            if (!testC()) {
                                branch(instruction);
                            }
                            break;
                        case 7: // BCS 1034 offset
                            //LOG_INSTRUCTION(instruction, "bcs", 3);
                            if (testC()) {
                                branch(instruction);
                            }
                            break;
                        case 8: // EMT 1040 operand
                            //LOG_INSTRUCTION(instruction, "emt", 0);
                            trap(0o30, 0x00); // Trap 30 - 0x00 EMT instruction
                            break;
                        case 9: // TRAP 1044 operand
                            //LOG_INSTRUCTION(instruction, "trap", 0);
                            trap(0o34, 0x00); // Trap 34 - 0x00 TRAP instruction
                            break;
                        default: // Remaining 10xxxx instructions where xxxx >= 05000
                            switch ((instruction >>> 6) & 0o77) { // 10xxDD group
                                case 0o50: // CLRB 1050DD
                                    //LOG_INSTRUCTION(instruction, "clrb", 1);
                                    if (writeByteByMode(instruction, 0) >= 0) {
                                        zeroNZVC();
                                    }
                                    break;
                                case 0o51: // COMB 1051DD
                                    //LOG_INSTRUCTION(instruction, "comb", 1);
                                    if ((dst = modifyByteByMode(instruction)) >= 0) {
                                        result = ~dst;
                                        if (modifyByte(result) >= 0) {
                                            setByteNZC(result);
                                        }
                                    }
                                    break;
                                case 0o52: // INCB 1052DD
                                    //LOG_INSTRUCTION(instruction, "incb", 1);
                                    if ((dst = modifyByteByMode(instruction)) >= 0) {
                                        result = dst + 1;
                                        if (modifyByte(result) >= 0) {
                                            setByteNZV(result, result & (result ^ dst));
                                        }
                                    }
                                    break;
                                case 0o53: // DECB 1053DD
                                    //LOG_INSTRUCTION(instruction, "decb", 1);
                                    if ((dst = modifyByteByMode(instruction)) >= 0) {
                                        result = dst + 0xffff;
                                        if (modifyByte(result) >= 0) {
                                            setByteNZV(result, (result ^ dst) & dst);
                                        }
                                    }
                                    break;
                                case 0o54: // NEGB 1054DD
                                    //LOG_INSTRUCTION(instruction, "negb", 1);
                                    if ((dst = modifyByteByMode(instruction)) >= 0) {
                                        result = -dst;
                                        if (modifyByte(result) >= 0) {
                                            setByteNZVC(result, result & dst);
                                        }
                                    }
                                    break;
                                case 0o55: // ADCB 01055DD
                                    //LOG_INSTRUCTION(instruction, "adcb", 1);
                                    if ((dst = modifyByteByMode(instruction)) >= 0) {
                                        result = dst;
                                        if (testC()) {
                                            result++;
                                        }
                                        if (modifyByte(result) >= 0) {
                                            setByteNZVC(result, result & (result ^ dst));
                                        }
                                    }
                                    break;
                                case 0o56: // SBCB 01056DD
                                    //LOG_INSTRUCTION(instruction, "sbcb", 1);
                                    if ((dst = modifyByteByMode(instruction)) >= 0) {
                                        result = dst;
                                        if (testC()) {
                                            result--;
                                        }
                                        if (modifyByte(result) >= 0) {
                                            setByteNZVC(result, (result ^ dst) & dst);
                                        }
                                    }
                                    break;
                                case 0o57: // TSTB 1057DD
                                    //LOG_INSTRUCTION(instruction, "tstb", 1);
                                    if ((result = readByteByMode(instruction)) >= 0) {
                                        setByteNZC(result);
                                    }
                                    break;
                                case 0o60: // RORB 1060DD
                                    //LOG_INSTRUCTION(instruction, "rorb", 1);
                                    if ((dst = modifyByteByMode(instruction)) >= 0) {
                                        result = (dst << 8) | (dst >>> 1);
                                        if (testC()) {
                                            result |= 0x80;
                                        }
                                        if (modifyByte(result) >= 0) {
                                            setByteNZVC(result, result ^ (result >>> 1));
                                        }
                                    }
                                    break;
                                case 0o61: // ROLB 1061DD
                                    //LOG_INSTRUCTION(instruction, "rolb", 1);
                                    if ((dst = modifyByteByMode(instruction)) >= 0) {
                                        result = dst << 1;
                                        if (testC()) {
                                            result |= 1;
                                        }
                                        if (modifyByte(result) >= 0) {
                                            setByteNZVC(result, result ^ dst);
                                        }
                                    }
                                    break;
                                case 0o62: // ASRB 1062DD
                                    //LOG_INSTRUCTION(instruction, "asrb", 1);
                                    if ((dst = modifyByteByMode(instruction)) >= 0) {
                                        result = (dst << 8) | (dst & 0x80) | (dst >>> 1);
                                        if (modifyByte(result) >= 0) {
                                            setByteNZVC(result, result ^ (result >>> 1));
                                        }
                                    }
                                    break;
                                case 0o63: // ASLB 1063DD
                                    //LOG_INSTRUCTION(instruction, "aslb", 1);
                                    if ((dst = modifyByteByMode(instruction)) >= 0) {
                                        result = dst << 1;
                                        if (modifyByte(result) >= 0) {
                                            setByteNZVC(result, result ^ dst);
                                        }
                                    }
                                    break;
                                    //case 0o64: // MTPS 1064SS
                                    //    //LOG_INSTRUCTION(instruction, "mtps", 1);
                                    //    if ((src = readByteByMode(instruction)) >= 0) {
                                    //        writePSW((CPU.PSW & 0xff00) | (src & 0xef));
                                    //    } // Temporary PDP 11/34A
                                    //    break;
                                case 0o65: // MFPD 1065DD
                                    //LOG_INSTRUCTION(instruction, "mfpd", 1);
                                    if (!(instruction & 0o70)) {
                                        reg = instruction & 7;
                                        if (reg !== 6 || ((CPU.PSW >>> 12) & 3) === CPU.mmuMode) {
                                            result = registerVal[reg];
                                        } else {
                                            result = CPU.stackPointer[(CPU.PSW >>> 12) & 3];
                                        }
                                        if (pushWord(result, 0) >= 0) {
                                            setNZ(result);
                                        }
                                    } else {
                                        if ((virtualAddress = getVirtualByMode(instruction, MMU_WORD)) >= 0) {
                                            setMMUmode((CPU.PSW >>> 12) & 3); // Use PM
                                            if ((result = readWordByVirtual(virtualAddress | 0x10000)) >= 0) {
                                                setMMUmode((CPU.PSW >>> 14) & 3); // Restore CM
                                                if (pushWord(result, 0) >= 0) {
                                                    setNZ(result);
                                                }
                                            }
                                        }
                                    }
                                    break;
                                case 0o66: // MTPD 1066DD
                                    //LOG_INSTRUCTION(instruction, "mtpd", 1);
                                    if ((result = popWord()) >= 0) {
                                        if (!(CPU.MMR0 & 0xe000)) {
                                            CPU.MMR1 = 0o26;
                                        }
                                        if (!(instruction & 0o70)) {
                                            reg = instruction & 7;
                                            if (reg !== 6 || ((CPU.PSW >>> 12) & 3) === CPU.mmuMode) {
                                                registerVal[reg] = result;
                                            } else {
                                                CPU.stackPointer[(CPU.PSW >>> 12) & 3] = result;
                                            }
                                            setNZ(result);
                                        } else { // Must extract virtual address before mode change...
                                            if ((virtualAddress = getVirtualByMode(instruction, MMU_WORD)) >= 0) {
                                                setMMUmode((CPU.PSW >>> 12) & 3); // Use PM
                                                if (writeWordByVirtual(virtualAddress | 0x10000, result) >= 0) {
                                                    setMMUmode((CPU.PSW >>> 14) & 3); // Restore CM
                                                    setNZ(result);
                                                }
                                            }
                                        }
                                    }
                                    break;
                                    //case 0o67: // MTFS 1064SS
                                    //    //LOG_INSTRUCTION(instruction, "mfps", 1);
                                    //    result = readPSW() & 0xff;
                                    //    if (!(instruction & 0o70)) {
                                    //        if (result & 0o200) {
                                    //            result |= 0xff00;
                                    //        }
                                    //        registerVal[instruction & 7] = result;
                                    //        setByteNZ(result);
                                    //    } else {
                                    //        if (writeByteByMode(instruction, result) >= 0) {
                                    //            setByteNZ(result);
                                    //        }
                                    //    } // Temporary PDP 11/34A
                                    //    break;
                                default: // We don't know this 0o10xxDD instruction
                                    //LOG_INSTRUCTION(instruction, "-unknown-", 0);
                                    trap(0o10, 0x00); // Trap 10 - 0x00 Illegal instruction
                                    break;
                            }
                            break;
                    }
                    break;
                case 9: // MOVB 11SSDD
                    //LOG_INSTRUCTION(instruction, "movb", 2);
                    if ((result = readByteByMode(instruction >>> 6)) >= 0) {
                        if (!(instruction & 0o70)) { // Need sign extension when writing to a register
                            if (result & 0o200) {
                                result |= 0xff00; // Special case: movb sign extends register to word size
                            }
                            registerVal[instruction & 7] = result;
                            setByteNZ(result);
                        } else {
                            if (writeByteByMode(instruction, result) >= 0) {
                                setByteNZ(result);
                            }
                        }
                    }
                    break;
                case 10: // CMPB 12SSDD
                    //LOG_INSTRUCTION(instruction, "cmpb", 2);
                    if ((src = readByteByMode(instruction >>> 6)) >= 0) {
                        if ((dst = readByteByMode(instruction)) >= 0) {
                            result = src - dst;
                            setByteNZVC(result, (result ^ src) & (src ^ dst));
                        }
                    }
                    break;
                case 11: // BITB 13SSDD
                    //LOG_INSTRUCTION(instruction, "bitb", 2);
                    if ((src = readByteByMode(instruction >>> 6)) >= 0) {
                        if ((result = readByteByMode(instruction)) >= 0) {
                            setByteNZ(src & result);
                        }
                    }
                    break;
                case 12: // BICB 14SSDD
                    //LOG_INSTRUCTION(instruction, "bicb", 2);
                    if ((src = readByteByMode(instruction >>> 6)) >= 0) {
                        if ((dst = modifyByteByMode(instruction)) >= 0) {
                            result = dst & ~src;
                            if (modifyByte(result) >= 0) {
                                setByteNZ(result);
                            }
                        }
                    }
                    break;
                case 13: // BISB 15SSDD
                    //LOG_INSTRUCTION(instruction, "bisb", 2);
                    if ((src = readByteByMode(instruction >>> 6)) >= 0) {
                        if ((dst = modifyByteByMode(instruction)) >= 0) {
                            result = dst | src;
                            if (modifyByte(result) >= 0) {
                                setByteNZ(result);
                            }
                        }
                    }
                    break;
                case 14: // SUB 16SSDD
                    //LOG_INSTRUCTION(instruction, "sub", 2);
                    if ((src = readWordByMode(instruction >>> 6)) >= 0) {
                        if ((dst = modifyWordByMode(instruction)) >= 0) {
                            result = dst - src;
                            if (modifyWord(result) >= 0) {
                                setNZVC(result, (result ^ dst) & (src ^ dst));
                            }
                        }
                    }
                    break;
                default: // 15  17xxxx FPP instructions
                    if (typeof executeFPP !== 'undefined') {
                        executeFPP(instruction);
                    } else { // Say we don't know this instruction
                        //LOG_INSTRUCTION(instruction, "-unknown-", 0);
                        trap(0o10, 0x00); // Trap 10 - 0x00 Illegal instruction
                    }
                    break;
            }
        }
    } while (--loopCount > 0);

    if (loopCount === 0) { // Count expired so check timing
        let interval = Date.now() - loopTime - 8;
        if (interval > 0) { // over time
            CPU.loopBase = Math.max(20, CPU.loopBase - interval * 32); // Reduce loop counts
        } else {
            if (interval < 0) { // under time - increase count
                CPU.loopBase -= interval * 33;
            }
        }
    }

    CPU.displayBusReg = CPU.PSW;
    CPU.displayMicroAdrs = instruction; // Fill in some dummy display info;
    if (CPU.runState === STATE_RUN) {
        CPU.displayDataPaths = dst & 0xffff;
        CPU.displayAddress &= 0xffff;
        setTimeout(emulate, 0); // immediately schedule another batch of instructions
    } else {
        CPU.displayDataPaths = registerVal[0];
        CPU.displayAddress = registerVal[7];
        if (CPU.runState === STATE_RESET) {
            CPU.runState = STATE_RUN;
            setTimeout(emulate, 60); // schedule instructions after a reset pause
        }
    }
}


var panel = {
    LIGHTS_STATE: [0x280, 0x300, 0x200, 0x80], // RUN, RESET, WAIT, HALT -> RUN, MASTER, PAUSE lights
    LIGHTS_MODE: [0x10, 0x20, 0, 0x40], // Kernel, Super, Undefined, User -> Kernel, Super, User lights
    addressLights: 0x3fffff, // current state of addressLights (a0-a21)
    displayLights: 0xffff, // current state of displayLights (d0-d15)
    statusLights: 0x3ffffff, // current state of statusLights (s0-s25)
    addressId: [], // DOM id's for addressLights
    displayId: [], // DOM id's for displayLights
    statusId: [], // DOM id's for statusLights
    baseLights: 0, // Relatively static status light bits
    powerSwitch: 0, // -1 off, 0 run, 1 locked
    rotary1: 0,
    rotary0: 0,
    halt: 0,
    step: 0,
    lampTest: 0,
    autoIncr: 0
};

function initPanel(idArray, idName, idCount) {
    "use strict";
    var id, elementId, initVal = 0;
    for (id = 0; id < idCount; id++) {
        if ((elementId = document.getElementById(idName + id))) {
            idArray[id] = elementId.style;
        } else {
            idArray[id] = {}; // If element not present make a dummy
        }
        initVal = initVal * 2 + 1;
    }
    return initVal;
}

// Some of the status lights are fairly static so they are precomputed. They need to be
// updated if the rotary panel dials are changed or the MMU mode changes (enabled, 11/22 bit).

function setBaseLights() { // Set semi-static background status lights bitmask
    "use strict";
    var baseLights = (0x400000 << panel.rotary1) | (0x4000 << panel.rotary0) | 0x3000;
    if (!CPU.mmuEnable) {
        baseLights |= 4; // MMU is in 16 bit mode..
    } else {
        if (!(CPU.MMR3 & 0x10)) {
            baseLights |= 2; // 18 bit
        } else {
            baseLights |= 1; // 22 bit
        }
    }
    panel.baseLights = baseLights;
}

// There are three groups of lights (LEDs/Globes):-
//  addressLights (a0-a21) which show either a virtual or physical memory address depending on switch rotary0
//  displayLights (d0-d15) shows current data depending on switch rotary1
//  statusLights (s0-s25) all else from MMU status, CPU mode, Bus status, parity, and position of rotary switches
// The updateLights() function runs frequently to calculate the three light bit mask values and then set the appropriate
// light visibility to either hidden or visible.
//
// statusLights:         25 24 23 22 21 20 19 18 17 16 15 14 13 12 11 10  9  8  7  6  5  4  3  2  1  0
//                      |  rotary1  |       rotary0         | PAR |PE AE Rn Pa Ma Us Su Ke Da 16 18 22
// The PDP 11/45 does not have all of the same lights as a PDP 11/70 - thus some must be dummied out in initPanel()

function updateLights() {
    "use strict";
    var addressLights, displayLights, statusLights;

    function updatePanel(oldMask, newMask, idArray) { // Update lights to match newMask
        "use strict";
        var id, changeMask;
        changeMask = oldMask ^ newMask;
        for (id = 0; changeMask; id++, changeMask >>= 1, oldMask >>= 1) { // while any differences..
            if (changeMask & 1) { // If this light has changed...
                if (oldMask & 1) {
                    idArray[id].visibility = 'hidden';
                } else {
                    idArray[id].visibility = 'visible';
                }
            }
        }
        return newMask;
    }
    if (panel.powerSwitch < 0) {
        addressLights = 0;
        displayLights = 0;
        statusLights = 0;
    } else {
        if (panel.lampTest) {
            addressLights = 0x3fffff;
            displayLights = 0xffff;
            statusLights = 0x3ffffff;
        } else {
            if (panel.rotary0 === 1) {
                addressLights = CPU.displayPhysical & 0x3fffff; // Set by memory management
            } else {
                addressLights = CPU.displayAddress; // Set by memory management virtual address OR by console operations
            }
            switch (panel.rotary1) {
                case 0:
                    displayLights = CPU.displayDataPaths; // Approximated by random result calculations
                    break;
                case 1:
                    displayLights = CPU.displayMicroAdrs; // Dummy micro address fpp/cpu display
                    break;
                case 2:
                    displayLights = CPU.displayBusReg; // Dummy bus register display
                    break;
                case 3:
                    displayLights = CPU.displayRegister; // Set by software write to @#17777570
                    break;
            }
            // rotary1 rotary0 PAR PE AE Rn Pa Ma Us Su Ke Da 16 18 22
            statusLights = panel.baseLights | (CPU.mmuLastPage & 8) | // Base lights & Data light
                panel.LIGHTS_STATE[CPU.runState] | // Run Pause and Master lights
                panel.LIGHTS_MODE[CPU.mmuMode]; // User Super and Kernel lights
            if (CPU.displayPhysical & 0x400000) {
                statusLights |= 0x400; // Set ADRS ERR light if appropriate
            }
        }
    }
    panel.addressLights = updatePanel(panel.addressLights, addressLights, panel.addressId);
    panel.displayLights = updatePanel(panel.displayLights, displayLights, panel.displayId);
    panel.statusLights = updatePanel(panel.statusLights, statusLights, panel.statusId);
    requestAnimationFrame(updateLights);
}

// One off functions to find light objects and to start animations

panel.addressLights = initPanel(panel.addressId, "a", 22);
panel.displayLights = initPanel(panel.displayId, "d", 16);
panel.statusLights = initPanel(panel.statusId, "s", 26);
setTimeout(updateLights, 100);

function boot() { // Reset processor, copy bootcode into memory, jump to start of bootcode
    "use strict";
    var i;
    for (i = 0; i < IOBASE_UNIBUS / 2; i++) {
        CPU.memory[i] = 0;
    }
    for (i = 0; i < bootcode.length; i++) {
        CPU.memory[(BOOTBASE >>> 1) + i] = bootcode[i];
    }
    CPU.registerVal[7] = CPU.registerVal[6] = BOOTBASE;
    CPU.PIR = 0;
    writePSW(0);
    reset_iopage();
    if (CPU.runState !== STATE_RUN) {
        CPU.runState = STATE_RUN;
        emulate();
    }
}