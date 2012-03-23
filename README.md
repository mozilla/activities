Activities addon

PreRequisite
===============

* Firefox
* Python
* Git
* make

Getting setup
=====================

To pull and run activities addon:
  
    git clone https://github.com/mozilla/activities
    cd activities
    echo /path/to/activities > /path/to/fx/Profiles/x.test/extensions/activities@labs.mozilla.com
    /path/to/firefox-bin -P test &
  
You can build an xpi:

    make xpi
  
You can run the tests:

    make test
  

Prepare your firefox profile
-----------------------------

You probably want a test firefox profile so open up the [Profile Manager](http://kb.mozillazine.org/Profile_manager).

In the Mac:

    /Applications/Firefox.app/Contents/MacOS/firefox -ProfileManager

On Windows:

    firefox.exe -P

In the profile manager, create a profile with the name `test`, then exit the profile manager.
