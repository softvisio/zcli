#!/usr/bin/env -S bash

set -Eeuo pipefail
trap 'echo "⚠  Error ($0:$LINENO, exit code: $?): $BASH_COMMAND" >&2' ERR

ROOT=$(pwd)
DISTS=$ROOT/dists

# init
_BUILD_ROOT=$(mktemp -d)
BUILD=$_BUILD_ROOT/build
DESTDIR=$_BUILD_ROOT/install
DEBIAN=$DESTDIR/DEBIAN
mkdir -p $BUILD
mkdir -p $DEBIAN

# spec variables
NAME=
DESCRIPTION=
EPOCH=0
VERSION=
REVISION=0
ARCHITECTURE=
DEPENDS=
RECOMMENDS=
CONFLICTS=
REPLACES=

# apt-get update

# load spec
. $ROOT/packages/$1

if [[ ! -z $FORCE_VERSION ]]; then
    VERSION=$FORCE_VERSION
fi

VERSION_STRING=
FILE_VERSION_STRING=
BUILD_ARCHITECTURE=

if [[ -z $EPOCH || $EPOCH == "0" ]]; then
    VERSION_STRING=$VERSION
    FILE_VERSION_STRING=$VERSION
else
    VERSION_STRING=$EPOCH:$VERSION
    FILE_VERSION_STRING=$EPOCH-$VERSION
fi

if [[ ! -z $REVISION && $REVISION != "0" ]]; then
    VERSION_STRING=$VERSION_STRING-$REVISION
    FILE_VERSION_STRING=$FILE_VERSION_STRING-$REVISION
fi

if [[ $ARCHITECTURE == "all" ]]; then
    BUILD_ARCHITECTURE=all
else
    BUILD_ARCHITECTURE=$(dpkg --print-architecture)
fi

function _build_local() {
    local cwd=$PWD

    cd $BUILD

    local error

    _build

    if [[ $? == 0 ]]; then
        _pack

        echo -e "\nPackage built successfully: $NAME $VERSION_STRING $BUILD_ARCHITECTURE"
    else
        error=1

        echo -e "\nPackage build failed"
    fi

    cd $cwd

    # cleanup
    rm -rf $_BUILD_ROOT

    if [[ error == 1 ]]; then exit 1; fi
}

function _build() { (
    apt-get update

    build
); }

function _pack() {
    local VERSION_ID=$(source /etc/os-release && echo $VERSION_ID)
    local TARGET=

    if [[ $ARCHITECTURE == "all" ]]; then
        TARGET=${DISTS}/binary-all/${NAME}_${FILE_VERSION_STRING}_all.deb
    else
        TARGET=${DISTS}/${VERSION_ID}/${COMPONENT}/binary-${BUILD_ARCHITECTURE}/${NAME}_${FILE_VERSION_STRING}_${BUILD_ARCHITECTURE}.deb
    fi

    # debian/control
    cat << EOF > $DEBIAN/control
Package: $NAME
Version: $VERSION_STRING
Architecture: $BUILD_ARCHITECTURE
Installed-Size: $(du -s $DESTDIR | cut -f1)
Depends: $DEPENDS
Recommends: $RECOMMENDS
Conflicts: $CONFLICTS
Replaces: $REPLACES
Maintainer: $MAINTAINER
Description: $DESCRIPTION
EOF

    # debian/changelog
    cat << EOF > $DEBIAN/changelog
$NAME (0.0.0-1) UNRELEASED; urgency=low
EOF

    mkdir -p $(dirname $TARGET)
    dpkg-deb --build -Zgzip --root-owner-group $DESTDIR $TARGET
}

_build_local
