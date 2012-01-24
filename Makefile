PYTHON = python

ifeq ($(TOPSRCDIR),)
  export TOPSRCDIR = $(shell pwd)
endif
profile :=
ifneq ($(FX_PROFILE),)
  profile := --profiledir="$(FX_PROFILE)"
endif

deps  := $(TOPSRCDIR)/deps
ifneq ($(DEPSDIR),)
  deps := $(DEPSDIR)
endif

binary  := 
ifneq ($(MOZ_BINARY),)
  binary := -b "$(MOZ_BINARY)"
endif

addon_sdk := $(deps)/addon-sdk/bin
oauthorizer := $(deps)/oauthorizer
activities := $(TOPSRCDIR)

pkgdir := $(activities)
cfx_args :=  --pkgdir=$(pkgdir) $(binary) $(profile) --package-path=$(oauthorizer) --binary-args="-console -purgecaches $(BINARYARGS)"

test_args :=
ifneq ($(TEST),)
    test_args := -f $(TEST)
endif

# might be useful for symlink handling...
SLINK = ln -sf
ifneq ($(findstring MINGW,$(shell uname -s)),)
  SLINK = cp -r
  export NO_SYMLINK = 1
endif

all: xpi

xpi:    pull
	$(addon_sdk)/cfx xpi $(cfx_args)

pull:
	$(PYTHON) build.py -p $(pkgdir)/package.json

test:
	$(addon_sdk)/cfx test -v $(cfx_args) $(test_args)

run:
	$(addon_sdk)/cfx run $(cfx_args)	


.PHONY: xpi clean pull test run
