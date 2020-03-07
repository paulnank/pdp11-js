# Example Boot logs from the various OS disk images


## Example boot of Unix V5

```
Boot> boot rk0
@unix

login: root
# cat /etc/passwd
root::0:1::/:
daemon::1:1::/bin:
bin::3:1::/bin:
# who
root    tty8 Mar 21 12:09
# chdir /usr/sys/ken
# pwd
../usr/sys/ken
# ls -al
total 121
drwxr-xr-x  2 bin       352 Nov 26 18:13 .
drwxr-xr-x  5 bin       384 Nov 26 18:13 ..
-rw-r--r--  1 bin      3855 Nov 26 18:13 alloc.c
-rw-r--r--  1 bin      2159 Nov 26 18:13 clock.c
-rw-r--r--  1 bin      2662 Nov 26 18:13 fio.c
-rw-r--r--  1 bin      2941 Nov 26 18:13 iget.c
-rw-r--r--  1 bin      2674 Nov 26 18:13 main.c
...
# ls -al /usr/games
total 64
drwxr-xr-x  2 bin       144 Nov 26 18:13 .
drwxr-xr-x 14 bin       224 Nov 26 18:13 ..
-rwxr-xr-x  1 bin      1562 Nov 26 18:13 bj
-rwxr-xr-x  1 bin     16268 Nov 26 18:13 chess
-rwxr-xr-x  1 bin      2468 Nov 26 18:13 cubic
-rwxr-xr-x  1 bin       624 Nov 26 18:13 moo
-rwxr-xr-x  1 bin      2192 Nov 26 18:13 ttt
-rw-rw-rw-  1 bin       294 Nov 26 18:13 ttt.k
-rwxr-xr-x  1 bin      5386 Nov 26 18:13 wump
# ls -al /bin
total 339
drwxr-xr-x  2 bin       944 Nov 26 18:13 .
drwxr-xr-x  9 bin       160 Jan 29 16:14 ..
-rwxr-xr-x  1 bin      1514 Nov 26 18:13 ar
-rwxr-xr-x  1 bin      7308 Nov 26 18:13 as
-rwxr-xr-x  1 bin      6042 Nov 26 18:13 bas
-rwxr-xr-x  1 bin       152 Nov 26 18:13 cat
-rwxr-xr-x  1 bin      5668 Nov 26 18:13 cc
....
# ls -al /usr/source/s2
total 281
drwxr-xr-x  2 bin       848 Jan  2 19:36 .
drwxr-xr-x  7 bin       112 Nov 26 18:13 ..
-rw-r--r--  1 bin      4233 Nov 26 18:13 mail.c
-rw-r--r--  1 bin       588 Nov 26 18:13 mesg.s
-rw-r--r--  1 bin      1088 Nov 26 18:13 mkdir.s
-rw-r--r--  1 bin      6922 Nov 26 18:13 mkfs.c
-rw-r--r--  1 bin       563 Nov 26 18:13 mknod.c
...
# chdir /
# cal 10 1981
Oct 1981
S  M Tu  W Th  F  S
1  2  3
4  5  6  7  8  9 10
11 12 13 14 15 16 17
18 19 20 21 22 23 24
25 26 27 28 29 30 31
# bas
print sqr(2)
1.414213562
10 print "Calculating e"
20 p = 20
30 k = 1
40 e = 0
50 for x=1 p
60 e = e + 1/k
70 k = k * x
80 next x
90 print "e=" e " (" exp(1) ")"
run
Calculating e
e=2.718281828 (2.718281828)
CTRL/D
# cat > hello.c
main(argc, argv)
char **argv;
{
printf("Hello world\n");
}
CTRL/D
# cc hello.c
# a.out
Hello world
# cat > pi.f
c PI via Nilakantha series: 3 + 4/(2*3*4) - 4/(4*5*6) + 4/(6*7*8) ...
      double precision pi, n, d
      pi = 3.0
      n = 4.0
      d = 2.0
      do 25 i=1,3000
        pi = pi + n / (d * (d + 1.0) * (d + 2.0))
        d = d + 2.0
        n = -n
 25     continue
      write(6,70) pi
 70   format('PI is approximately ', d2.16)
      end
CTRL/D
# fc pi.f
# a.out
PI is approximately 0.3141592653580503d+01
#

```


##Example boot of RT11 v4.0

```
Boot> boot rk1
RT-11SJ  V04.00C

.D 56=5015

.TYPE V4USER.TXT
Welcome to RT-11 Version 4. RT-11 V04 provides new hardware support
and some major enhancements over Version 3B.

Please use the HELP command;  it describes the new options in many
of the utilities.

If you are using a terminal that requires fill characters,
modify location 56 with a Deposit command before proceeding with
system installation. LA36 DECwriter II and VT52 DECscope terminals
do NOT require such modification.

.D 56=0

.DIR

SWAP  .SYS    25  01-Feb-82      RT11BL.SYS    65  01-Feb-82
RT11SJ.SYS    67  01-Feb-82      RT11FB.SYS    80  01-Feb-82
...
DISMT2.COM     8  01-Feb-82      DUNGEO.COM     1  07-Jun-86
DSAVE .DAT    10  07-Jun-86      ADVENT.DOC     4  20-Jul-85
DUNGEO.SAV   216  07-Jun-86      DINDX .DAT    20  07-Jun-86
DTEXT .DAT   383  07-Jun-86      ADVENT.SAV    93  20-Jul-85
ADVENT.VAR    22  20-Jul-85      ADVTXT.TXT   125  20-Jul-85
ODT11 .MAC    61  31-Oct-74      ANIMAL.SAV    22  02-Oct-85
BLKJAK.SAV    20  02-Nov-85      FORTH .MAC   146
RTLEM .MAC   363  06-Sep-73      BOOT  .MAC    26  24-Mar-75
 118 Files, 3392 Blocks
 1370 Free blocks

.R DUNGEO
Welcome to Dungeon.                     This version created 10-AUG-78.
You are in an open field west of a big white house with a boarded
front door.
There is a small mailbox here.
>OPEN MAILBOX
Opening the mailbox reveals:
  A leaflet.
>READ LEAFLET
Taken.
                    Welcome to Dungeon!

   Dungeon is a game of adventure, danger, and low cunning.  In it
you will explore some of the most amazing territory ever seen by mortal
man.  Hardened adventurers have run screaming from the terrors contained
within.

   In Dungeon, the intrepid explorer delves into the forgotten secrets
of a lost labyrinth deep in the bowels of the earth, searching for
vast treasures long hidden from prying eyes, treasures guarded by
fearsome monsters and diabolical traps!

   No DECsystem should be without one!

   Dungeon was created at the Programming Technology Division of the MIT
Laboratory for Computer Science by Tim Anderson, Marc Blank, Bruce
Daniels, and Dave Lebling.  It was inspired by the Adventure game of
Crowther and Woods, and the Dungeons and Dragons game of Gygax
and Arneson.  The original version was written in MDL (alias MUDDLE).
The current version was translated from MDL into FORTRAN IV by
a somewhat paranoid DEC engineer who prefers to remain anonymous.

   On-line information may be obtained with the commands HELP and INFO.
>QUIT
Your score would be   0 [total of 560 points], in    1 move.
This gives you the rank of beginner.
Do you wish to leave the game?
Y

.MAC RTLEM
ERRORS DETECTED:  0
.LINK RTLEM
.RUN RTLEM
... attempt to land the lunar module using the mouse as a light pen - goodluck!
```

## Example boot of RSTS V06C-03

```
Boot> boot rk2

RSTS V06C-03 Vixen (DK2)

Option:

You currently have: JOB MAX = 31, SWAP MAX = 28K.

You currently have crash dump disabled.

DD-MMM-YY? 31-OCT-76
12:00 PM? 9:03
INIT    V06C-03 RSTS V06C-03 Vixen

Command File Name?
DETACHING...

I11/70
Password: PDP

Ready

DIR
 Name .Ext  Size    Prot   Date       SY:[11,70]
ACEY  .BAS     5   < 60> 31-Oct-76
TREK  .BAS    16   < 60> 31-Oct-76
TREK  .DOC     9   < 60> 31-Oct-76
ANIMAL.BAS     5   < 60> 31-Oct-76
STRTRK.BAS    27   < 60> 31-Mar-81
STRTR1.BAS     9   < 60> 31-Mar-81
ADVENT.DOC     4   < 60> 20-Jul-85
ADVENT.SAV    93   <124> 20-Jul-85
ADVENT.VAR    22   < 60> 20-Jul-85
ADVTXT.TXT   125   < 60> 20-Jul-85
SYSMAC.SML    42   < 60> 13-Mar-77
HELLO .MAC     1   < 60> 13-Mar-77
PRIME .BAS     1   < 60> 24-Mar-76
PI    .BAS     1   < 60> 24-Mar-76
BOOT  .MAC    26   < 60> 01-Jan-76

Total of 386 blocks in 15 files in SY:[11,70]

Ready

RUN PI
3.14159265358979

Ready

RUN ADVENT

WELCOME TO ADVENTURE!!  WOULD YOU LIKE INSTRUCTIONS?

NO
YOU ARE STANDING AT THE END OF A ROAD BEFORE A SMALL BRICK BUILDING.
AROUND YOU IS A FOREST.  A SMALL STREAM FLOWS OUT OF THE BUILDING AND
DOWN A GULLY.

E
YOU ARE INSIDE A BUILDING, A WELL HOUSE FOR A LARGE SPRING.

THERE ARE SOME KEYS ON THE GROUND HERE.

THERE IS A SHINY BRASS LAMP NEARBY.

THERE IS FOOD HERE.

THERE IS A BOTTLE OF WATER HERE.

GET FOOD
OK

QUIT
DO YOU REALLY WANT TO QUIT NOW?

Y
OK
YOU SCORED  32 OUT OF A POSSIBLE 350, USING    3 TURNS.
YOU ARE OBVIOUSLY A RANK AMATEUR.  BETTER LUCK NEXT TIME.
TO ACHIEVE THE NEXT HIGHER RATING, YOU NEED  4 MORE POINTS.

Ready

RUN ACEY
                          ACEY DUCEY CARD GAME
               CREATIVE COMPUTING  MORRISTOWN, NEW JERSEY


ACEY-DUCEY IS PLAYED IN THE FOLLOWING MANNER
THE DEALER (COMPUTER) DEALS TWO CARDS FACE UP
YOU HAVE AN OPTION TO BET OR NOT BET DEPENDING
ON WHETHER OR NOT YOU FEEL THE CARD WILL HAVE
A VALUE BETWEEN THE FIRST TWO.
IF YOU DO NOT WANT TO BET, INPUT A 0
YOU NOW HAVE 100 DOLLARS.

HERE ARE YOUR NEXT TWO CARDS:
 4
 5

WHAT IS YOUR BET? 100
 9
SORRY, YOU LOSE

SORRY, FRIEND, BUT YOU BLEW YOUR WAD.

TRY AGAIN (YES OR NO)? NO

O.K., HOPE YOU HAD FUN!

Ready

SYSTAT

RSTS V06C-03 Vixen status at 31-Oct-76, 09:05 AM Up: 2:34

Job    Who    Where    What    Size    State    Run-Time   RTS
 1    [OPR]   Det     ERRCPY    5K     SR            5.0  BASIC
 2    [SELF]  KB0     SYSTAT    8K     RN Lck        2.1  BASIC

Busy Devices: None

Disk Structure:
Disk    Open    Free    Cluster Errors  Name    Comments
DK2       3     324        1      0     VIXEN   Pub, DLW

Small   Large   Jobs    Hung TTY's      Errors
380       1      2/2        0              0

Run-Time Systems:
 Name   Ext       Size  Users   Comments
BASIC   BAC     16(16)K   2     Perm, Addr:26, KBM, CSZ
RSX     TSK      2(28)K   0     Non-Res, KBM
RT11    SAV      4(28)K   0     Temp, Addr:66, KBM, CSZ, EMT:255
RMS11   TSK      4(28)K   0     Non-Res

Message Receivers:
 Name   Job     Msgs    Max     Senders
ERRLOG   1       0      40      Priv

Ready

BYE/Y
Saved all disk files; 388 blocks in use, 112 free
Job 2 User 11,70 logged off KB0 at 31-Oct-76 09:05 AM
System RSTS V06C-03 Vixen
Run time was 2.7 seconds
Elapsed time was 2 minutes
Good morning
```

## Example boot of XXDP

```
Boot> boot rk3

CHMDKB1 XXDP+ DK MONITOR
BOOTED VIA UNIT 3
28K UNIBUS SYSTEM

ENTER DATE (DD-MMM-YY):

RESTART ADDR: 152010
THIS IS XXDP+.  TYPE "H" OR "H/L" FOR HELP.

.R EKBB??
EKBBF0.BIC

CEKBBF0 11/70 CPU #2
A
CPU UNDER TEST FOUND TO BE A KB11-B/C OR KB11-CM
LOOK AT THE CONSOLE LIGHTS
THE DATA LIGHTS SHOULD READ 166667
THE ADDRESS LIGHTS SHOULD READ  032236
CHANGE SWITCH 7 TO CONTINUE
LOOK AT THE CONSOLE LIGHTS
THE DATA LIGHTS SHOULD READ 166667
THE ADDRESS LIGHTS SHOULD READ  032316
TYPE A CHARACTER TO CONTINUE

END PASS #     1  TOTAL ERRORS SINCE LAST REPORT      0
AAAAAAAAAAAAAAAAAAAAA
END PASS #     2  TOTAL ERRORS SINCE LAST REPORT      0
AAAAAAAAAAAAAAAAAAAAA
END PASS #     3  TOTAL ERRORS SINCE LAST REPORT      0
AAAAAAAAAAAAAAAAAAAAA
END PASS #     4  TOTAL ERRORS SINCE LAST REPORT      0
AAAAAAAAAAAAAAAAAAAAA
END PASS #     5  TOTAL ERRORS SINCE LAST REPORT      0
AAAAAAAAAAAAAAAAAAAAA
...
```

## Example boot of RSTS 4B-17

```
Boot> boot tm0

ROLLIN V07

#DK:<MT:VIXEN/REW
END-OF-FILE DURING READ, TYPE
M TO MOUNT ANOTHER REEL, OR K TO KILL REQUEST: k

#/BO:DK:

RSTS V04B-17 VIXEN

OPTION? ^J
DD-MON-YY? 24-MAR-75
HH:MM? 9:21
VIXEN  - SYSTEM PACK MOUNTED
ENABLE CRASH DUMP? N
CHAIN "INIT"
CATASTROPHIC ERROR
PROGRAM LOST-SORRY
I/O CHANNEL NOT OPEN

Ready

SYSTEM INITIALIZATION PROGRAM

END OF FILE ON DEVICE - INIT ASSUMED COMPLETE

Ready

CAT
LOGIN .BAS       7       60     31-Oct-71 31-Oct-71 06:42 AM
LOGIN .BAC       15      60     31-Oct-71 31-Oct-71 06:42 AM
LOGOUT.BAS       7       60     31-Oct-71 31-Oct-71 06:42 AM
LOGOUT.BAC       15      60     31-Oct-71 31-Oct-71 06:42 AM
PIP   .BAS       18      60     31-Oct-71 31-Oct-71 06:42 AM
PIP   .BAC       23      40     31-Oct-71 31-Oct-71 06:42 AM
SYSTAT.BAS       12      60     31-Oct-71 31-Oct-71 06:42 AM
SYSTAT.BAC       19      168    31-Oct-71 31-Oct-71 06:42 AM
...

Ready

RUN TTYSET
'TTYSET' TERMINAL CHARACTERISTICS PROGRAM
? LC
? ^Z

Ready

run utilty
'UTILTY' SYSTEM UTILITY PROGRAM
? LOGINS
? HELP
COMMANDS ARE:
 MOUNT DEV:ID           DISMOUNT DEV:
 LOCK DEV:              UNLOCK DEV:
 NO LOGINS              LOGINS
 CLEAN DEV:             KILL JOB#
 SEND KBN: STRING       FORCE KBN: [^]STRING
 CHANGE [ACCT]PASSWORD  QUOTA [ACCT] QUOTA
 ZERO DEV:[ACCT]        HANGUP KBN:
 DATE DD-MMM-YY         TIME HH:MM
? ^Z

Ready

run pip
PIP - RSTS V04B-17 VIXEN
#acct.sys
11,70,PDP,0,2,PDP 11/70 EMULATOR
#^Z

Ready

run systat
OUTPUT STATUS TO? kb:

RSTS V04B-17 VIXEN STATUS ON 24-Mar-75 AT 09:22 AM UP: 1:07

JOB    WHO      WHERE    WHAT   SIZE    STATE     RUN-TIME
 1     1,2       KB0    SYSTAT   6K     RN             0.1

BUSY DEVICES: NONE

DISK STRUCTURE:
DISK    OPEN     FREE   CLUSTER ERRORS  COMMENTS
DK0      0       3185     1       0     PUBLIC

SMALL  LARGE   ERRORS  HUNG TTY'S
 69     0      0        0

Ready

bye
CONFIRM: y
SAVED ALL DISK FILES; 782 BLOCKS IN USE
JOB 1 USER 1,2 LOGGED OFF KB0 AT 24-Mar-75 09:22 AM
SYSTEM RSTS V04B-17 VIXEN
RUN TIME WAS .1 SECONDS
ELAPSED TIME WAS 1 MINUTE, 20 SECONDS
GOOD MORNING

```

## Example boot of BSD 2.9

```
Boot> boot rl0
:boot

70Boot
: rl(0,0)rlunix

Berkeley UNIX (Rev. 2.9.1) Sun Nov 20 14:55:50 PST 1983
mem = 3797696
xp2: drive type 20 unrecognized
xp3: drive type 20 unrecognized

CONFIGURE SYSTEM:
xp 0 csr 176700 vector 254 attached
rk 0 csr 177400 vector 220 attached
hk ? csr 177440 vector 210 skipped:  No CSR
rl 0 csr 174400 vector 160 attached
rp ? csr 176700 vector 254 interrupt vector already in use
ht 0 csr 172440 vector 224 skipped:  No CSR
tm 0 csr 172520 vector 224 attached
ts 0 csr 172520 vector 224 interrupt vector already in use
dh ? csr 160020 vector 370 skipped:  No CSR
dm ? csr 170500 vector 360 skipped:  No autoconfig routines
dz ? csr 160110 vector 320 skipped:  No CSR
dz ? csr 160110 vector 320 skipped:  No CSR
dn 0 csr 175200 vector 300 skipped:  No autoconfig routines
vp ? csr 177500 vector 174 skipped:  No autoconfig routines
lp 0 csr 177514 vector 200 attached
Erase=^?, kill=^U, intr=^C
# ^D
Wed Dec 31 16:02:43 PST 1969
/etc/fstab: No such file or directory
/usr/sys: No such file or directory
init: /dev/tty07: cannot open
init: /dev/tty06: cannot open
init: /dev/tty05: cannot open
init: /dev/tty04: cannot open
init: /dev/tty03: cannot open
init: /dev/tty02: cannot open
init: /dev/tty01: cannot open
init: /dev/tty00: cannot open


Berkeley Unix 2.9BSD

:login: root

Welcome to the 2.9BSD (Berkeley) UNIX system.


# cat /etc/passwd
root::0:2:The Man:/:/bin/csh
toor::0:2:The Man:/:
daemon:***:1:1:The devil himself:/:
sys:***:2:1::/:
bin:***:3:1::/:
uucp::4:1:UNIX-to-UNIX Copy:/usr/spool/uucppublic:/usr/lib/uucp/uucico
notes:***:5:1:Notesfiles maintainer:/usr/spool/notes:
anon:***:6:1:Notesfiles anonymous user:/usr/spool/notes:
news:***:7:1:News maintainer:/usr/spool/news:
wnj:ZDjXDBwXle2gc:8:2:Bill Joy,457E,7780:/a/guest/wnj:/bin/csh
dmr:AiInt5qKdjmHs:9:2:Dennis Ritchie:/a/guest/dmr:
ken:sq5UDrPlKj1nA:10:2:& Thompson:/a/guest/ken:
mike:KnKNwMkyCt8ZI:11:2:mike karels:/a/guest/mike:/bin/csh
carl:S2KiTfS3pH3kg:12:2:& Smith,508-21E,6258:/a/guest/carl:/bin/csh
joshua::999:2:&:/usr/games:/usr/games/wargames
# ls -al
total 546
drwxr-xr-x11 root     daemon       512 Mar  7 09:00 .
drwxr-xr-x11 root     daemon       512 Mar  7 09:00 ..
-rw-rw-r-- 1 root     daemon       164 Sep 29 09:20 .cshrc
-rw-rw-r-- 1 root     daemon       266 Mar  7 08:43 .login
-rw-rw-r-- 1 root     superuse       2 Jul 26 16:00 .msgsrc
-rw-rw-r-- 1 root     daemon       116 Mar 30 00:59 .profile
-rw-r--r-- 1 root     superuse      56 Nov 20 16:03 2.9stamp
-rw-rw-r-- 1 root     superuse     450 Mar 30 00:50 READ_ME
drwxrwxr-x 2 bin      bin         1632 Nov 20 16:04 bin
-rwxrwxr-x 1 root     superuse   23572 Mar  7 09:05 boot
drwxrwxr-x 2 root     superuse    1424 Nov 20 18:11 dev
drwxr-xr-x 2 root     superuse     768 Nov 20 17:46 etc
-rwxrwxr-x 1 root     superuse     561 Jul 26 16:55 genallsys.sh
-rwxr-xr-x 1 root     sys        74534 Nov 20 16:38 hkunix
drwxrwxr-x 2 bin      bin          416 Nov 20 16:06 lib
drwxrwxr-x 2 root     daemon      4128 Dec  7 22:35 lost+found
drwxrwxr-x 2 root     superuse     128 Apr 11 10:00 mdec
drwx------ 2 root     daemon        32 Jul  7 13:07 mnt
-rwxr-xr-x 1 root     sys        74534 Nov 20 16:38 rkunix
-rwxr-xr-x 1 root     sys        74534 Nov 20 16:38 rlunix
-rwxr-xr-x 1 root     sys        74534 Nov 20 16:39 rpunix
drwxrwxrwx 2 root     superuse     144 May 30 19:42 tmp
-rwxr-xr-x 2 root     sys       104798 Nov 20 16:33 unix
drwxrwxrwx 2 root     superuse      48 Feb 18 18:16 usr
-rwxr-xr-x 2 root     sys       104798 Nov 20 16:33 xpunix
#
```

## Example boot of RSX 11M v3.2

```
Boot> boot rl1

  RSX-11M V3.2 BL26   1912K  MAPPED
>RED DL1:=SY:
>RED DL1:=LB:
>MOU DL1:RSXM26
>@DL1:[1,2]STARTUP
>* Enter date and time ( dd-mmm-yy hh:mm ) [S]: 29-JAN-90 12:01
>TIM 29-JAN-90 12:01
>INS $PIP
>INS $EDT
>BYE
>
HAVE A GOOD AFTERNOON
29-JAN-90 12:01 TT0:  LOGGED OFF
>@ <EOF>
>HELLO 1,2
PASSWORD:

        RSX-11M BL26   MULTI-USER SYSTEM

GOOD AFTERNOON
29-JAN-90 12:01 LOGGED ON TERMINAL TT0:

Welcome to RSX-11M V3.2 timesharing
 
>PIP/LI

DIRECTORY DL1:[1,2]
29-JAN-90 12:01

HELLO.MAC;1         1.         30-OCT-76 12:02
SYE.HLP;1           8.         26-MAY-79 13:52
EDTCOM.MSG;1        16.        26-MAY-79 13:52
QIOSYM.MSG;1        29.        26-MAY-79 13:52
LOGIN.TXT;1         1.         31-OCT-81 12:11
HELP.HLP;1          1.         31-OCT-81 12:11
STARTUP.CMD;1       1.         31-OCT-81 12:04
FORTH.MAC;1         149.       30-OCT-76 12:02

TOTAL OF 206./223. BLOCKS IN 8. FILES

>INS $MAC
>MAC HELLO,HELLO=HELLO
>INS $TKB
>TKB HELLO=HELLO
>INS HELLO
>RUN HELLO
>
 HELLO WORLD!

>UNS HELLO
>BYE
>
HAVE A GOOD AFTERNOON
29-JAN-90 12:02 TT0:  LOGGED OFF
>
```

## Example boot of RSTS/E v7.0

```
Boot> boot rl2

RSTS V7.0-07 Vixen (DL2)

Option: ^J

You currently have: JOB MAX = 63, SWAP MAX = 31K.

Default memory allocation table specifies some existing memory
as being nonexistent.

Table will be reset by RSTS.

  Memory allocation table:

     0K: 00000000 - 00207777 (  34K) : EXEC
    34K: 00210000 - 00307777 (  16K) : RTS (BASIC)
    50K: 00310000 - 16737777 (1862K) : USER
  1912K: 16740000 - End              : NXM


  Table suboption? ^J

You currently have crash dump disabled.

DD-MMM-YY? 31-OCT-81
12:00 PM? 9:32
INIT    V7.0-07 RSTS V7.0-07 Vixen

Command File Name? ^J
DETACHING...
...

ERRINT  V7.0-07 RSTS V7.0-07 Vixen
ERRLOG File is 2% Full
Change Size to < 100 >?
Utilize Crash File Output (Yes/No) <No>?
Detaching . . .

I11,70
Password: PDP

Welcome to RSTS/E V7.0 time sharing
...

Ready

DIR
 Name .Ext    Size   Prot    Date       SY:[11,70]
ACEY  .BAS       5   < 60> 31-Oct-76
TREK  .BAS      16   < 60> 31-Oct-76
TREK  .DOC       9   < 60> 31-Oct-76
ANIMAL.BAS       5   < 60> 31-Oct-76
STRTRK.BAS      27   < 60> 31-Mar-81
STRTR1.BAS       9   < 60> 31-Mar-81
ADVENT.DOC       4   < 60> 20-Jul-85
ADVENT.SAV      93   <124> 20-Jul-85
ADVENT.VAR      22   < 60> 20-Jul-85
ADVTXT.TXT     125   < 60> 20-Jul-85
SYSMAC.SML      42   < 60> 13-Mar-77
HELLO .MAC       1   < 60> 13-Mar-77
BOOT  .MAC      24   < 60> 13-Mar-77
PRIME .BAS       1   < 60> 24-Mar-76
PI    .BAS       1   < 60> 24-Mar-76

Total of 384 blocks in 15 files in SY:[11,70]

Ready

SYSTAT

RSTS V7.0-07 Vixen status at 31-Oct-81, 09:32 AM Up: 36

Job    Who    Where    What    Size    State    Run-Time    RTS
 1    [OPR]   Det     ERRCPY    5K     SR            4.7   BASIC
 2    [SELF]  KB0     SYSTAT   11K     RN Lck        0.3   BASIC

Busy Devices: None

Disk Structure:
Disk    Open    Free    Cluster Errors  Name    Comments
DL2       3     2500       1      0     VIXEN   Pub, DLW

Small   Large   Jobs    Hung TTY's      Errors
486       1      2/2        0              0

Run-Time Systems:
 Name   Ext       Size  Users   Comments
BASIC   BAC     16(16)K   2     Perm, Addr:34, KBM, CSZ
RT11    SAV      4(28)K   0     Non-Res, KBM, CSZ, EMT:255
RSX     TSK      3(28)K   0     Non-Res, KBM
TECO    TEC      8(24)K   0     Non-Res

Resident Libraries: None

Message Receivers:
 Name   Job     Msgs    Max     Senders
ERRLOG   1       0      40      Priv

Ready

EDT TEST.BAS
*I
10 PRINT "SIMPLE TEST"
20 END
^Z
*EX
2 LINES OUTPUT

Ready

OLD TEST

Ready

RUN
TEST    09:33 AM        31-Oct-81
SIMPLE TEST

Ready

BYE
Confirm: Y
Saved all disk files; 387 blocks in use, 113 free
Job 2 User 11,70 logged off KB0 at 31-Oct-81 09:33 AM
System RSTS V7.0-07 Vixen
Run time was .6 seconds
Elapsed time was 1 minute
Good morning
```

## Example boot of XXDP

```
Boot> boot rl3

CHMDLD0 XXDP+ DL MONITOR
BOOTED VIA UNIT 3
28K UNIBUS SYSTEM

ENTER DATE (DD-MMM-YY):

RESTART ADDR: 152010
THIS IS XXDP+.  TYPE "H" OR "H/L" FOR HELP.

.R EQKC??
EQKCE1.BIC

CEQKC-E...PDP 11/70 CPU EXERCISER

CPU UNDER TEST FOUND TO BE A 11/74          (KB11CM)

PROCESSOR ID REGISTER =000001 (OCTAL)       1 (DECIMAL)
OPT.CP=165406
OPERATIONAL SWITCH SETTINGS
SWITCH                  USE
  15            HALT ON ERROR
  14            LOOP ON TEST
  13            INHIBIT ERROR TYPEOUTS
  12            INHIBIT UBE
  11            INHIBIT ITTERATIONS
  10            BELL ON ERROR
   9            LOOP ON ERROR
   8            ALLOW RELOCATION VIA I/O DEVICE (NOTE CHANGE)
   7            INHIBIT TYPEOUT OF THIS TEXT AND SYS SIZE
   6            INHIBIT RELOCATION
   5            INHIBIT ROUND ROBIN RELOCATION
   4            INHIBIT RANDOM DISK ADDRESS
   3            INHIBIT MBT
   2            THESE THREE SWITCHES
   1            ARE ENCODED TO SELECT RELOCATION
   0            ON THE FOLLOWING DEVICES:
        0...RP11/RP03
        1...RK11/RK05
        2...NOT USED
        3...NOT USED
        4...RH70/RP04
        5...RH70/RS04 OR RS03
        6...NOT USED
        7...NOT USED

**NOTE** SWITCH REG BIT 8 HAS BEEN REVERSED IN REV D
NOTE THAT SWR BIT 8 SET NOW ALLOWS I/O RELOCATION

THIS PROGRAM SUPPORTS I/O RELOCATION ONLY WITH THE FOLLOWING DEVICES:
RP03,RK05,RP04/5/6,RS03/4
THE FOLLOWING DEVICES AND DRIVES WILL BE USED FOR RELOCATION IF BIT 8 SET:
DEVICE  DRIVES
RK05    0, 1, 2, 3, 4, 5, 6, 7,
RP04    0, 1, 2, 3, 4,
TYPE A CHARACTER TO CONTINUE
k1THE QUICK BROWN FOX JUMPED OVER THE LAZY DOGS BACK 0123456789
2THE QUICK BROWN FOX JUMPED OVER THE LAZY DOGS BACK 0123456789
3THE QUICK BROWN FOX JUMPED OVER THE LAZY DOGS BACK 0123456789
4THE QUICK BROWN FOX JUMPED OVER THE LAZY DOGS BACK 0123456789
5THE QUICK BROWN FOX JUMPED OVER THE LAZY DOGS BACK 0123456789
000:01:01

END PASS #     1  TOTAL ERRORS SINCE LAST REPORT      0
1THE QUICK BROWN FOX JUMPED OVER THE LAZY DOGS BACK 0123456789
```

## Example boot of ULTRIX-11 System V3.1

```
Boot> boot rp0

Sizing Memory...

Boot: hp(0,0)unix    (CTRL/C will abort auto-boot)

hp(0,0)unix: 36754+55616+8128+7744+8128+7616+3648

ULTRIX-11 Kernel V3.1

realmem = 3915776
buffers = 73728
clists  = 2080
usermem = 3677312
maxumem = 417792
proc on q
erase = delete, kill = ^U, intr = ^C
# ^D

Restricted rights:

        Use, duplication, or disclosure is subject
        to restrictions stated in your contract with
        Digital Equipment Corporation.

*UNIX is a trademark of AT&T Bell Laboratories.

Mounted /dev/hp01 on /usr
Mounted /dev/hp05 on /user1

Sat Oct 31 16:52:30 PST 1981

ERROR LOG has - 1 of 200 blocks used


ULTRIX-11 System V3.1 (vixen)

login: root

Welcome to the ULTRIX-11 System

erase = delete, kill = ^U, intr = ^C
vixen# ls -al
total 373
drwxr-xr-x16 root        912 Oct 31 16:40 .
drwxr-xr-x16 root        912 Oct 31 16:40 ..
-rw-rw-r-- 1 root         93 Jan 15 06:07 .cshrc
-rw-rw-r-- 1 root        115 Jan 15 06:07 .login
-rw-r--r-- 1 root        204 Oct 31 16:39 .profile
drwx------ 2 root        144 Oct 31 17:00 .setup
drwxr-xr-x 2 root       3424 Oct 31 16:02 bin
-rw-r--r-- 1 root      42548 Jan 20 13:43 boot
-rw-r--r-- 1 root      42548 Jan 20 13:43 boot.bu
-rw-r--r-- 1 root        191 Oct  6 07:58 crt.profile
drwxr-xr-x 2 root       4736 Oct 31 16:52 dev
drwxr-xr-x 4 root       1232 Oct 31 16:52 etc
-rw-r--r-- 2 root     131330 Oct 31 16:25 gunix
-rw-rw-r-- 1 root         36 Oct 31 16:40 hello.c
drwxr-xr-x 2 root        544 Oct 31 17:00 lib
drwx------ 2 root        512 Sep 26 08:53 lost+found
drwxr-xr-x 2 root        256 Aug  6 17:21 mdec
drwxrwxr-x 2 root         32 Oct 31 16:20 media
drwx------ 2 root         32 Jul 10  1980 mnt
drwx------ 2 root        256 Sep 29 16:01 opr
-rw-r--r-- 1 root        185 Oct  6 07:58 prt.profile
drwxr-xr-x 2 root        640 Jul 28 05:45 sas
-rw-rw-r-- 1 root        249 Oct 31 16:40 size.c
drwxrwxrwx 2 root        304 Oct 31 16:02 tmp
-rw-r--r-- 2 root     131330 Oct 31 16:25 unix
drwxr-xr-x 6 root         96 Oct 31 16:37 user1
drwxr-xr-x24 root        384 Oct 31 16:05 usr
vixen# df
Filesystem    total    kbytes  kbytes  percent
   node       kbytes    used    free   used    Mounted on
/dev/hp00       4606    3120    1486    68%    /
/dev/hp01       9629    7800    1829    80%    /usr
/dev/hp05      81036   28489   52547    35%    /user1
vixen# who
root     console     Oct 31 16:52
vixen# ps -aux

   PID TTY TIME CMD
    41 co  0:00 -sh
    50 co  0:00 ps -aux
vixen# cc hello.c
vixen# a.out
Hello world
vixen# cat > size.c
#include <stdio.h>
int main() {
    printf("Size of char: %d byte\n",sizeof(char));
    printf("Size of int: %d bytes\n",sizeof(int));
    printf("Size of float: %d bytes\n",sizeof(float));
    printf("Size of double: %d bytes\n",sizeof(double));
}
^D
vixen# cc size.c
vixen# a.out
Size of char: 1 byte
Size of int: 2 bytes
Size of float: 4 bytes
Size of double: 8 bytes
vixen# ls /user1
lost+found  root        src         user1
vixen# ls /user1/src
etc  src  sys  usr
vixen# ls -al /user1/src/usr
total 6
drwxrwxr-x 6 root         96 Oct 31 16:38 .
drwxrwxr-x 6 root         96 Oct 31 16:38 ..
drwxrwxr-x 3 root         48 Oct 31 16:38 games
drwxrwxr-x 5 root         80 Oct 31 16:38 include
drwxrwxr-x 3 root         96 Oct 31 16:38 lib
drwxrwxr-x 2 root         64 Oct 31 16:38 local
vixen# uname
ULTRIX-11
vixen# ^D

ULTRIX-11 System V3.1 (vixen)

login: sys

Welcome to the ULTRIX-11 System

$ cd conf
$ sysgen
...
```

## Example boot of BSD 2.11

```
Boot> boot rp1

70Boot from xp(0,1,0) at 0176700
Press <CR> to boot, or any other key to abort: 0
: xp(0,1,0)unix
Boot: bootdev=05010 bootcsr=0176700

2.11 BSD UNIX #2: Oct 31 04:05:24 PST 1981
    root@Sat:/usr/src/sys/VIXEN

phys mem  = 3915776
avail mem = 3684480
user mem  = 307200

hk ? csr 177440 vector 210 skipped:  No CSR.
ht ? csr 172440 vector 224 skipped:  No CSR.
ra ? csr 172150 vector 154 skipped:  No CSR.
rl 0 csr 174400 vector 160 attached
tm 0 csr 172520 vector 224 attached
tms ? csr 174500 vector 260 skipped:  No CSR.
ts ? csr 172520 vector 224 interrupt vector already in use.
xp 0 csr 176700 vector 254 attached
Automatic reboot in progress...
Sat Oct 31 16:00:38 PST 1981
Sat Oct 31 16:00:38 PST 1981
checking quotas: done.
Assuming non-networking system ...
checking for core dump...
preserving editor files
clearing /tmp
standard daemons: update cron accounting.
starting lpd
starting local daemons: sendmail.
Sat Oct 31 16:00:40 PST 1981


2.11 BSD UNIX (vixen.2bsd.com) (console)

login: root
erase, kill ^U, intr ^C
# df
Filesystem  1K-blocks     Used    Avail Capacity  Mounted on
/dev/xp1a      163557    85424    78133    52%    /
# ps -aux
USER       PID NICE SZ TTY TIME COMMAND
root         0   0   8 ?   0:00 swapper
root         1   0  29 ?   0:00  (init)
root        42   0  11 ?   0:00 update
root        45   0  51 ?   0:00 cron
root        49  -1  26 ?   0:00 acctd
root        55   0  47 ?   0:00 /usr/sbin/lpd
root        75   0  19 co  0:00 -sh
root        81   0  59 co  0:00 ps -aux
# ls -al
total 721
drwxr-xr-x 14 root         1024 Oct 31 04:11 .
drwxr-xr-x 14 root         1024 Oct 31 04:11 ..
-rw-r--r--  1 root          349 Oct 29  1996 .cshrc
-rw-r--r--  1 root            0 May 17  1995 .hushlogin
-rw-r--r--  1 root          153 May  2  1997 .kermrc
-rw-r--r--  1 root          335 Oct 29  1996 .login
-rw-r--r--  1 root            8 Jan 17  1988 .mailrc
-rw-r--r--  1 root          152 Oct 29  1996 .profile
-rw-------  1 root            0 Apr 22  2000 .rhosts
-rw-r--r--  1 root           12 May  2  1997 .tiprc
-r--r--r--  1 root        18648 Aug 28  1992 README
-rw-r--r--  1 root         2714 Oct 31 02:55 VERSION
-rw-r--r--  1 root         3371 Oct 31 02:55 VERSION~
drwxr-xr-x  3 root          512 Apr 23  2000 a
drwxr-xr-x  2 root         1024 Apr 23  2000 bin
-rwxr-x---  1 root        36286 Oct 31 04:03 boot
drwxr-xr-x  3 root         4608 Oct 31 04:23 dev
-rwxr-x--x  1 root        38798 Oct 31 04:03 disklabel
drwxr-xr-x  3 root         1024 Oct 31 16:00 etc
-rwxr--r--  1 root       170258 Apr 22  2000 genunix
-rw-r-----  1 root        11520 Oct 31 16:00 hostid.core
drwxr-xr-x  2 root          512 Apr 23  2000 lib
drwxr-xr-x  2 root         1024 Aug 17  1990 lost+found
-rw-r--r--  1 root        27072 Oct 31 16:00 lpd.core
drwxr-xr-x  2 root          512 Apr 23  2000 mdec
drwxr-xr-x  2 root          512 Dec 31  1991 mnt
-rwxr-----  1 root       170258 Oct 31 03:15 oldunix
drwxr-xr-x  2 root          512 Apr 23  2000 sbin
-rw-r--r--  1 root        24896 Oct 31 16:00 sendmail.core
lrwxrwxrwx  1 root           11 Apr 23  2000 sys -> usr/src/sys
drwxrwxrwt  2 root          512 Oct 31 16:00 tmp
-rwxr-xr-x  1 root        30490 Oct 31 04:03 toyset
-rwxr--r--  1 root       170509 Oct 31 04:05 unix
drwxr-xr-x 28 root          512 Oct 31 02:03 usr
drwxr-xr-x  6 root          512 Apr 23  2000 var
lrwxrwxrwx  1 root            4 Apr 23  2000 vmunix -> unix
# while true; do echo; /usr/games/fortune; sleep 5; done

A man's best friend is his dogma.

Three rules for sounding like an expert:
1. Oversimplify your explanations to the point of uselessness.
2. Always point out second-order effects,
   but never point out when they can be ignored.
3. Come up with three rules.

The human mind treats a new idea the way the
body treats a strange protein: it rejects it.
                -- P. Medawar

Charlie was a chemist,
But Charlie is no more.
What Charlie thought was H2O was H2SO4.

^C
# cat > hello.c
#include <stdio.h>
main() {
    printf("Hello world\n");
}
^D
# cc hello.c
# ls -al hello* a.out
-rwxr-x--x  1 root         5335 Mar 31 15:52 a.out
-rw-r-----  1 root           59 Mar 31 15:52 hello.c
# ./a.out
Hello world
# cat > size.c
#include <stdio.h>
int main() {
    printf("Size of char: %d byte\n",sizeof(char));
    printf("Size of int: %d bytes\n",sizeof(int));
    printf("Size of float: %d bytes\n",sizeof(float));
    printf("Size of double: %d bytes\n",sizeof(double));
}
^D
# cc size.c
# ./a.out
Size of char: 1 byte
Size of int: 2 bytes
Size of float: 4 bytes
Size of double: 8 bytes
# cd /sys/VIXEN
# make
make -f Make.sys I=/usr/include H=../h M=../machine AS="/bin/as -V" CPP="/lib/cpp -P -DKERNEL -DVIXEN -DFPSIM -DSOFUB_MAP -I. -I../h"  CFLAGS="-O -DKERNEL -DVIXEN -DFPSIM -DSOFUB_MAP -I. -I../h" SED="/bin/sed"
cc -O -DKERNEL -DVIXEN -DFPSIM -DSOFUB_MAP -I. -I../h -S ../sys/init_main.c
/bin/sed -f SPLFIX init_main.s | /bin/as -V -u -o init_main.o
rm -f init_main.s
cc -O -DKERNEL -DVIXEN -DFPSIM -DSOFUB_MAP -I. -I../h -S ../sys/init_sysent.c
...
text    data    bss     dec     hex
55168   8458    24348   87974   157a6   total text: 124736
        overlays: 7680,7360,7680,7488,7488,7744,5632,8000,7744,2752
Compacting symbol table
symcompact unix
symcompact: 228 symbols removed
Compacting strings table
strcompact unix
rearranging symbols
symorder ../pdp/symbols.sort unix
./checksys unix
System will occupy 220576 bytes of memory (including buffers and clists).

               end {0100046}          nbuf {0020350}           buf {0046716}
             nproc {0020336}          proc {0063746}         ntext {0020340}
              text {0077006}         nfile {0020344}          file {0074352}
            ninode {0020342}         inode {0020432}      ncallout {0020346}
           callout {0037216}     ucb_clist {0020354}        nclist {0020352}
          ram_size {0000000}       xitdesc {0020430}      quotdesc {0000000}
         namecache {0037736}       _iosize {0010456}          nlog {0017414}
# make install
install -c -o root -g kmem -m 744 unix /unix
# shutdown -h now
Shutdown at 04:29 (in 0 minutes) [pid 80]

        *** FINAL System shutdown message from root@vixen.2bsd.com ***

System going down IMMEDIATELY

System shutdown time has arrived
# syncing disks... done
halting
```

## Example boot of RSTS V9.6

```
Boot> boot rp2

RSTS V9.6-11 RSTS   (DB2) INIT V9.6-11

Today's date? 31-OCT-86

Current time? 11:12

Start timesharing? <Yes> ^J

Default memory allocation table shows LESS
memory than INIT detects on this machine.

Adjusting memory table.

  Memory allocation table:

     0K: 00000000 - 00433777 (  71K) : EXEC
    71K: 00434000 - 15163777 (1622K) : USER
  1693K: 15164000 - 16737777 ( 219K) : XBUF

Memory available to RSTS/E is 1912K words.

86.10.31 11:12

1 device disabled

Proceed with system startup? <YES> ^J

 Beginning RSTS/E system startup...
86.10.31  11:12      Installing monitor overlays
86.10.31  11:12      Mounting disks
86.10.31  11:12      Assigning logical names
86.10.31  11:12      Starting error logging
86.10.31  11:12      Setting system characteristics
31-Oct-86 11:12 AM   Installing run-time systems and libraries
31-Oct-86 11:12 AM   Setting terminal characteristics
31-Oct-86 11:12 AM   Defining system commands
31-Oct-86 11:12 AM   Setting printer characteristics
31-Oct-86 11:12 AM   Starting spoolers

*** From [1,2] on KB0: at 11:12 AM 31-Oct-86
** RSTS/E is on the air...

I11,70
Last logged in on 31-Oct-86, 06:42 AM at KB0:

Welcome to RSTS/E V9.6 time sharing
...

$ systat

RSTS V9.6-11 RSTS/E V9.6 status at 31-Oct-86, 11:12 AM Up: 29

Job    Who    Where     What    Size    State    Run-Time    RTS
 1     1,2    Det      ERRCPY    5K     SR            1.3    ...RSX
 2    11,70   KB0      SYSTAT   16K     RN Lck        0.2    ...RSX
 3     1,2    Det      PBS...   19K     SL            0.1    ...RSX

Busy Devices: None

Disk Structure:
Dsk  Open    Size      Free    Clu   Err Name      Level  Comments
DB2    18  171796  119440  69%   4     0 VIXEN      1.2   Pub, DLW

General  FIP                    Hung
Buffers  Buffers  Jobs/Jobmax   TTY's   Errors
  734      461       3/63         0        0

Run-Time Systems:
 Name   Typ   Dev    Size    Users  Comments
...RSX  TSK          0(32)K    3    Monitor, KBM
DCL     COM   DB2:   24(8)K    0    Temp, Addr:71, DF KBM
RT11    SAV   DB2:   4(28)K    0    Temp, Addr:108, KBM, CSZ, EMT:255
BASIC   BAC   DB2:  16(16)K    0    Non-Res, KBM, CSZ
TECO    TEC   DB2:  10(20)K    0    Non-Res, KBM

Resident Libraries:
 Name  Prot        Acct      Size  Users  Comments
CSPLIB < 42>  DB2:[  0,1  ]    8K    2    Temp, Addr:100
EDT    < 42>  DB2:[  0,11 ]   39K    0    Non-Res
RMSRES < 42>  DB2:[  0,10 ]    4K    1    Temp, Addr:1689
RMSLBA < 42>  DB2:[  0,10 ]    4K    1    Temp, Addr:139
RMSLBB < 42>  DB2:[  0,10 ]    3K    1    Temp, Addr:132
RMSLBC < 42>  DB2:[  0,10 ]    3K    1    Non-Res
RMSLBD < 42>  DB2:[  0,10 ]    2K    1    Temp, Addr:143
RMSLBE < 42>  DB2:[  0,10 ]    3K    1    Temp, Addr:125
RMSLBF < 42>  DB2:[  0,10 ]    4K    1    Temp, Addr:128
DAPRES < 42>  DB2:[  0,10 ]   10K    0    Non-Res, Addr:1679

Message Receivers:
Rcvrid   Job    Rib  Obj   Msgs/Max   Links/InMax/OutMax  Access
ERRLOG    1      0    1       0/40          0/0/0          Prv
QM$CMD    3      1    3       0/20          0/0/255        Prv
QM$SRV    3      2    4       0/30          0/0/255        Prv
QM$URP    3      3    5       0/10          0/0/255        Lcl
PR$03A    3     17   65       0/5           0/0/255        Prv
PR$03B    3     25   65       0/5           0/0/255        Prv
BA$03A    3     41   66       0/5           0/0/255        Prv
BA$03B    3     49   66       0/5           0/0/255        Prv
BA$03C    3     57   66       0/5           0/0/255        Prv
$ help

You can obtain on-line information about any DCL command or qualifier, as
well as many other general topics.  For more complete details about a
topic, refer to the appropriate RSTS manual or guide.

The RSTS/E System User's Guide contains descriptions of the DCL commands
and qualifiers that you use in file, system, and programming operations.

The RSTS/E System Manager's Guide contains descriptions of the DCL
commands and qualifiers used in system management operations.

See the RSTS/E Quick Reference Guide for the syntax of all DCL commands
and qualifiers on RSTS/E.

For instructions on how to use this HELP facility, type HELP HELP from
DCL, or type HELP in response to the HELP Topic?  prompt.

Additional help is available on:

@               Accounts        Advanced        ALLOCATE        APPEND
ASSIGN          ATTACH          BACKUP          BASIC           BROADCAST
BYE             CCL             CLOSE           COBOL           COPY
CREATE          Dates           DCL             DEALLOCATE      DEASSIGN
DEFINE          DELETE          DETACH          DIBOL           DIFFERENCES
DIRECTORY       DISMOUNT        DUMP            EDIT            Entries
EOD             EXIT            Expressions     Files           FORCE
...

Topic? ^Z
$ set term/width:80
$ dir

 Name .Typ    Size    Prot     Name .Typ    Size    Prot    SY:[11,70]
ACEY  .BAS       5   < 60>    TREK  .BAS      16   < 60>
TREK  .DOC       9   < 60>    ANIMAL.BAS       5   < 60>
STRTRK.BAS      27   < 60>    STRTR1.BAS       9   < 60>
ADVENT.DOC       4   < 60>    ADVENT.SAV      93   <124>
ADVENT.VAR      22   < 60>    ADVTXT.TXT     125   < 60>
SYSMAC.SML      42   < 60>    HELLO .MAC       1   < 60>
BOOT  .MAC      24   < 60>    PI    .BAS       1   < 60>
PRIME .BAS       1   < 60>

Total of 384 blocks in 15 files in SY:[11,70]

$ switch basic

Ready

run prime
 1             2             3             5             7
 11            13            17            19            23
 29            31            37            41            43
...
CPU TIME       2.7           SECONDS

Ready

list
PRIME   11:14 AM    31-Oct-86
10 REM PRIME NUMBERS
20 S=TIME(1)
30 FOR I%=1% TO 1000%
40  FOR J%=2% TO I%-1%
50   IF I%/J%*J%=I% THEN 80
60  NEXT J%
70 PRINT I%,
80 NEXT I%
90 PRINT
100 PRINT "CPU TIME ", (TIME(1) - S) / 10, " SECONDS"
999 END

Ready

bye
Saved all disk files on SY: 424 blocks in use
Job 2 User 11,70 logged off KB0: at 31-Oct-86 11:14 AM
System RSTS V9.6-11 RSTS/E V9.6
Run time was 4.2 seconds
Elapsed time was 2 minutes
Good morning
```

## Example boot of RSX 11M 4.6

```
PAUL NANKERVIS - PAULNANK@HOTMAIL.COM

Boot> boot rp3


  RSX-11M V4.6 BL56   1912.K MAPPED
>RED DB3:=SY:
>RED DB3:=LB:
>MOU DB3:RSXM56
>@DB3:[1,2]STARTUP
>* PLEASE ENTER TIME AND DATE (HR:MN DD-MMM-YY) [S]: 11:12 31-OCT-76
>TIM 11:12 31-OCT-76
>* ENTER LINE WIDTH OF THIS TERMINAL [D D:132.]: 80
>SET /BUF=TI:80.
>ACS SY:/BLKS=1024.
>;
>; This system startup command file (LB:[1,2]STARTUP.CMD) contains a
>; template of commands to initialize the queue print spooler and queue
>; LP0:, initialize the error logger, initialize the DCL CLI, and install
>; the RMS Library and Utilities.  As is these commands are commented out
>; and are not executed.  To include these commands as part of the
>; startup procedure, edit the file to remove the period and semi-colon
>; (.;) comment delimiter from the beginning of each line.  These
>; commands may be useful for initializing the various facilities for
>; your installation or else they may provide a model with which to
>; tailor initialization commands for your particular installation. 
>;
>ELI /LOG
11:12:04  ERRLOG -- Error Logging initialized
>CLI /INIT=DCL/TASK=...DCL
>INS LB:[1,54]PIP.TSK
>INS LB:[1,54]EDT.TSK
>INS LB:[1,54]TKB.TSK
>INS LB:[1,54]MAC.TSK
>INS LB:[1,54]BRU.TSK
>@ <EOF>
>PIP [200,1]/LI


Directory DB3:[200,1]
31-OCT-76 11:12

GSA.MAC;1           19.        03-JAN-90 17:07
SEARCH.MAC;1        10.        03-JAN-90 17:07
RENAME.MAC;1        12.        03-JAN-90 17:07
ERASE.MAC;1         10.        03-JAN-90 17:07
PARSE.MAC;1         11.        03-JAN-90 17:07
SEARCH.TSK;1        26.     C  03-JAN-90 17:07
RENAME.TSK;1        26.     C  03-JAN-90 17:07
ERASE.TSK;1         25.     C  03-JAN-90 17:07
PARSE.TSK;1         22.     C  03-JAN-90 17:07
INTRO.ULB;1         199.       31-OCT-76 06:50
INTROFIL.CMD;1      2.         31-OCT-76 06:50
CLEAN.CMD;1         1.         31-OCT-76 06:50
CLKGEN.CMD;1        8.         31-OCT-76 06:50
DELETE.CMD;1        1.         31-OCT-76 06:50
LOGIN.CMD;1         1.         31-OCT-76 06:50
MYDISK.CMD;1        4.         31-OCT-76 06:50
SHAVE.CMD;1         1.         31-OCT-76 06:50
SHOW.CMD;1          1.         31-OCT-76 06:50
CLOCK.MAC;1         47.        31-OCT-76 06:50
HIYA.MAC;1          8.         31-OCT-76 06:50
STARS.MAC;1         2.         31-OCT-76 06:50
TMCLI.MAC;1         22.        31-OCT-76 06:50
TMCLI.FTN;1         22.        31-OCT-76 06:50
ERROR.TSK;1         4.      C  31-OCT-76 06:50
SEVERE.TSK;1        4.      C  31-OCT-76 06:50
SUCCESS.TSK;1       4.      C  31-OCT-76 06:50
WARNING.TSK;1       4.      C  31-OCT-76 06:50
FLU.TXT;1           1.         31-OCT-76 06:50
FLY.TXT;1           1.         31-OCT-76 06:50
FLY.TXT;2           1.         31-OCT-76 06:50
FLY.TXT;3           1.         31-OCT-76 06:50
HELLO.TXT;1         2.         31-OCT-76 06:50
LONG.TXT;1          25.        31-OCT-76 06:50
WHATSHERE.TXT;1     6.         31-OCT-76 06:50

Total of 533./533. blocks in 34. files

>HELP
 
        Help is available for many RSX-11M commands and utilities.  
 
        For help in logging into the system, type HELP HELLO or HELP 
        LOGIN.  You'll need a user-ID and password to log in.  Ask your
        system manager.
 
        RSX-11M systems have two major command languages or CLIs:  MCR
        and DCL.  Once you log in, your terminal is set to either
        MCR or DCL.  (All terminals are set to MCR prior to logging in.)
 
        The general forms of the HELP command are:
 
                >HELP[/cli] topic [subtopic[s]]
 
                >HELP commandname [switch]
 
        Once you are logged in, you need not include the name of the CLI
        to which your terminal is set.   
        
        For information on what further help is available, type
        HELP[/MCR] LIST (brackets indicate an optional command line
        entry) or HELP/DCL.  For a listing of help available on other
        topics, type HELP[/MCR] MORE or HELP/DCL MORE.  You need not
        log in to get help.
 
>TAS
LDR... 13.02  LDRPAR 248. 00002600 LB0:-00104402 FIXED
TKTN   05.00  SYSPAR 248. 00011700 LB0:-00110145 
...RMD 03.00  GEN    225. 00027200 LB0:-00112034 
F11MSG 13.00  GEN    200. 00005700 LB0:-00110164 
MTAACP 15.01  GEN    200. 00014700 LB0:-00111651 
...DMO 04.00  GEN    160. 00014600 LB0:-00107227 
MCR... 07.00  SYSPAR 160. 00011700 LB0:-00110050 
...DCL 5.04   GEN    160. 00051500 LB0:-00110525 
...MOU 27.01  GEN    160. 00037700 LB0:-00110402 
...MCR 07.00  GEN    160. 00020000 LB0:-00110211 
F11ACP 06.01  FCPPAR 149. 00024200 LB0:-00107323 
ERRLOG 2.00   GEN    148. 00040000 LB0:-00112507 
PMT... 2.00   GEN    148. 00006300 LB0:-00107503 
COT... 2.0    GEN    145. 00013600 LB0:-00107246 
PMD... 08.01  GEN    140. 00016200 LB0:-00111623 
SHF... 6.00   SYSPAR 105. 00011700 LB0:-00112174 
...INS 9.01   GEN    100. 00034600 LB0:-00107777 
...SAV 05.00  GEN    100. 00033300 LB0:-00111541 
...UFD 05.00  GEN    100. 00005700 LB0:-00110176 
QMG... 03.04  GEN     75. 00031700 LB0:-00110460 
PRT... 2.0    GEN     70. 00001100 LB0:-00110160 
LP0    06.00  GEN     70. 00014500 LB0:-00111437 
...ACS 3.00   GEN     70. 00005000 LB0:-00112500 
...BRU 11.03  GEN     70. 00173500 LB0:-00113217 
...EDT V03.17 GEN     65. 00145600 LB0:-00114674 
...AT. 9.0    GEN     64. 00060000 LB0:-00107575 
...QUE 05.01  GEN     50. 00020100 LB0:-00111244 
...PRI 05.01  GEN     50. 00020100 LB0:-00111244 
...BOO 06.02  GEN     50. 00022000 LB0:-00107166 
...ELI 1.00   GEN     50. 00017300 LB0:-00112553 
...MAG 03.00  GEN     50. 00031500 LB0:-00110077 
...LOA 04.02  GEN     50. 00032600 LB0:-00111777 
...HEL 04.00  GEN     50. 00024100 LB0:-00112354 
...BYE 07.00  GEN     50. 00012700 LB0:-00112312 
...BRO 07.00  GEN     50. 00030400 LB0:-00112421 
...UNL 4.02   GEN     50. 00024500 LB0:-00111406 
...PIP 18.03  GEN     50. 00040000 LB0:-00116314 
...TKB X43.00 GEN     50. 00070000 LB0:-00117002 
...MAC V05.05 GEN     50. 00070000 LB0:-00116130 
>BYE
Have a Good Morning
31-OCT-76 11:12 TT0:  logged off VIXEN 
>HELLO
Account or name: 11,70
Password: PDP

RSX-11M BL56   [1,54] System     VIXEN 
31-OCT-76 11:12 Logged on Terminal TT0:

Good Morning

>@LOGIN.CMD
        
                
Welcome to RSX-11M V4.6 time sharing

This is a minimal system with a user account of 200,1 (no password) and 11,70 (p
assword of PDP)

Hopefully it demonstrates how things were in the good old days

Paul Nankervis
paulnank@hotmail.com
http://skn.noip.me/pdp11/pdp11.html

>@ <EOF>
>DIR


Directory DB3:[11,70]
31-OCT-76 11:12

HELLO.MAC;1         1.         31-OCT-76 06:55
LOGIN.CMD;1         1.         31-OCT-76 06:48
LOGIN.CMD;2         1.         31-OCT-76 06:48

Total of 3./3. blocks in 3. files

>EDIT HELLO.MAC
    1       ;       HELLO WORLD IN ASSEMBLER FOR THE DEC PDP-11 WITH THE
*type whole
    1       ;       HELLO WORLD IN ASSEMBLER FOR THE DEC PDP-11 WITH THE
    2       ;   RSX-11M-PLUS OPERATING SYSTEM
    3       ;
    4               .TITLE HELLO
    5               .IDENT /V0001A/
    6               .MCALL QIOW$S, EXIT$S
    7               .PSECT $CODE,RO,I
    8       START:  QIOW$S  #IO.WVB,#5,#2,,,,<#STR,#LEN,#40>
    9               EXIT$S
   10               .PSECT $DATA,RO,D
   11       STR:    .ASCII / HELLO WORLD!/
   12               LEN=.-STR
   13               .END START
   14           
[EOB]
*exit
DB3:[11,70]HELLO.MAC;2 14 lines
>MACRO HELLO
>LINK HELLO
>RUN HELLO
 HELLO WORLD!
>LOGOUT
Have a Good Morning
31-OCT-76 11:13 TT0:  logged off VIXEN 
>
```
