REM YOU NEED TO EDIT THIS FILE TO USE IT - ALL IT CONTAINS ARE COMMENTS
REM
REM Access to local data files is probibited by most modern browsers because of
REM cross-origin security policy.
REM See: https://www.theregister.co.uk/2019/07/09/mozilla_firefox_local_files_bug/
REM
REM Although the web page content and scripts are able to locally load and
REM run this security policy prevents the emulator from being able to access
REM disk images containing operating systems. As a result any attempt to boot
REM an operating system within a local emulator page (file:///...) will fail.
REM There are two main work arounds:-
REM  1) Make the emulator files available to your browser through a web server
REM  2) Accept the security risk and allow the browser to read local files
REM
REM You need to edit this procedure to choose the appropriate option for you
REM by editing the appropriate commands and removing the lower case "rem".
REM
REM
REM Option 1
REM For the first option you will obviously require a web server. On windows
REM the simplest method is probably to use the http.server module (formerly
REM SimpleHTTPServer) bundled with python. On my system I use winpython
REM (obtained from https://sourceforge.net/projects/winpython/) because it doesn't
REM require installation. In the command below the python path is d:\WinPython\
REM which you would need to edit to match where your python is located.
REM Start the python http.server to serve the content of the current folder on port 1170:-
rem start d:\WinPython\python-3.8.2.amd64\python.exe -m http.server 1170
rem start chrome "http://localhost:1170/pdp11.html"
REM
REM  -- OR --
REM
REM Option 2
REM If you don't want to install a local web server then you may be able to
REM allow your web browser to directly access local files. The method for this
REM differs for each browser but for chrome it requires starting it with the
REM -allow-file-access-from-files flag to allow local file access (permitting
REM access to disk images). If chrome is already open then the flag is
REM silently ignored - so please ensure chrome is not running first.
REM
REM For security reasons chrome should not be used for general web browsing
REM while this flag is in effect.
REM Start chrome enabling local file access and open "pdp11.html" from the current directory:-
rem start chrome -allow-file-access-from-files   "file:///%__CD__%pdp11.html"