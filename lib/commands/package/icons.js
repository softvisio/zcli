import sharp from "sharp";
import File from "#core/file";
import FileTree from "#core/file-tree";
import Command from "#lib/command";

const icons = {

    // android
    "android": [

        // application icons
        {
            "source": "icon.png",
            "targets": {
                "android/icons/ldpi.png": { "w": 36, "h": 36 },
                "android/icons/mdpi.png": { "w": 48, "h": 48 },
                "android/icons/hdpi.png": { "w": 72, "h": 72 },
                "android/icons/xhdpi.png": { "w": 96, "h": 96 },
                "android/icons/xxhdpi.png": { "w": 144, "h": 144 },
                "android/icons/xxxhdpi.png": { "w": 192, "h": 192 },
            },
        },

        // notification icons, monochrome with alpha channel
        {
            "source": "android-notification-icon.png",
            "targets": {
                "android/icons/notification-default/mdpi.png": { "w": 24, "h": 24, "greyscale": true },
                "android/icons/notification-default/hdpi.png": { "w": 36, "h": 36, "greyscale": true },
                "android/icons/notification-default/xhdpi.png": { "w": 48, "h": 48, "greyscale": true },
                "android/icons/notification-default/xxhdpi.png": { "w": 72, "h": 72, "greyscale": true },
                "android/icons/notification-default/xxxhdpi.png": { "w": 96, "h": 96, "greyscale": true },
            },
        },

        // large notification icon, color
        {
            "source": "icon.png",
            "targets": {
                "android/icons/notification-default/notification-icon-large.png": { "w": 256, "h": 256 },
            },
        },
    ],

    // electron
    "electron": [

        // application
        {
            "source": "icon.png",
            "targets": {
                "electron/icons/icon.png": { "w": 256, "h": 256 },
            },
        },
    ],

    // ios
    "ios": [

        // application
        {
            "source": "icon.png",
            "targets": {
                "ios/icons/icon-20.png": { "w": 20, "h": 20 },
                "ios/icons/icon-20@2x.png": { "w": 40, "h": 40 },
                "ios/icons/icon-20@3x.png": { "w": 60, "h": 60 },
                "ios/icons/icon-40.png": { "w": 40, "h": 40 },
                "ios/icons/icon-40@2x.png": { "w": 80, "h": 80 },
                "ios/icons/icon-50.png": { "w": 50, "h": 50 },
                "ios/icons/icon-50@2x.png": { "w": 100, "h": 100 },
                "ios/icons/icon-60@2x.png": { "w": 120, "h": 120 },
                "ios/icons/icon-60@3x.png": { "w": 180, "h": 180 },
                "ios/icons/icon-72.png": { "w": 72, "h": 72 },
                "ios/icons/icon-72@2x.png": { "w": 144, "h": 144 },
                "ios/icons/icon-76.png": { "w": 76, "h": 76 },
                "ios/icons/icon-76@2x.png": { "w": 152, "h": 152 },
                "ios/icons/icon-83.5@2x.png": { "w": 167, "h": 167 },
                "ios/icons/icon-1024.png": { "w": 1024, "h": 1024 },
                "ios/icons/icon-29.png": { "w": 29, "h": 29 },
                "ios/icons/icon-29@2x.png": { "w": 58, "h": 58 },
                "ios/icons/icon-29@3x.png": { "w": 87, "h": 87 },
                "ios/icons/icon.png": { "w": 57, "h": 57 },
                "ios/icons/icon@2x.png": { "w": 114, "h": 114 },
                "ios/icons/icon-24@2x.png": { "w": 48, "h": 48 },
                "ios/icons/icon-27.5@2x.png": { "w": 55, "h": 55 },
                "ios/icons/icon-44@2x.png": { "w": 88, "h": 88 },
                "ios/icons/icon-86@2x.png": { "w": 172, "h": 172 },
                "ios/icons/icon-98@2x.png": { "w": 196, "h": 196 },
            },
        },
    ],
};

export default class extends Command {

    // static
    static cli () {
        return {
            "description": "Run it from the package resources directory",
            "options": {
                "android": {
                    "description": "Generate icons for android only",
                    "default": false,
                    "schema": { "type": "boolean" },
                },
                "electron": {
                    "description": "Generate icons for electron only",
                    "default": false,
                    "schema": { "type": "boolean" },
                },
                "ios": {
                    "description": "Generate icons for iOS only",
                    "default": false,
                    "schema": { "type": "boolean" },
                },
            },
        };
    }

    // public
    async run () {
        const pkg = this._findPackage();

        if ( !pkg ) return result( [ 500, "Unable to find package" ] );

        const fileTree = new FileTree(),
            resources = pkg.root + "/resources";

        const osFilter = process.cli.options.android || process.cli.options.electron || process.cli.options.ios;

        for ( const os in icons ) {
            if ( osFilter && !process.cli.options[ os ] ) continue;

            for ( const spec of icons[ os ] ) {
                const img = sharp( resources + "/" + spec.source );

                for ( const [ name, target ] of Object.entries( spec.targets ) ) {
                    console.log( name );

                    const icon = img.clone().resize( {
                        "width": target.w,
                        "height": target.h,
                    } );

                    if ( target.greyscale ) icon.greyscale();

                    fileTree.add( new File( {
                        "path": "resources/" + name,
                        "sources": await icon.toFormat( "png" ).toBuffer(),
                    } ) );
                }
            }
        }

        return fileTree.write( pkg.root );
    }
}
