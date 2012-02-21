PYTHON = python

ifeq ($(MOZ_DIST),)
  MOZ_DIST=../mozilla-central/obj-ff-dbg/dist
endif
MOZ_SDK=$(MOZ_DIST)/sdk/bin

all: xpt

xpt:
	PYTHONPATH=$(MOZ_SDK) $(PYTHON) $(MOZ_SDK)/typelib.py components/mozIActivitiesAPI.idl --cachedir . -I $(MOZ_DIST)/idl/ -o components/mozIActivitiesAPI.xpt

xpi: xpt
	zip -rD share.xpi chrome.manifest install.rdf components/ content/ locale/ modules/ skin/