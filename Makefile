PYTHON = python

MOZ_DIST=/Users/shanec/moz/mozilla-central/obj-ff-dbg/dist
MOZ_SDK=$(MOZ_DIST)/sdk/bin

all: xpt

xpt:
	PYTHONPATH=$(MOZ_SDK) $(PYTHON) $(MOZ_SDK)/typelib.py components/mozIActivitiesAPI.idl --cachedir . -I $(MOZ_DIST)/idl/ -o components/mozIActivitiesAPI.xpt
