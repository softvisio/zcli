import GitRelease from "#core/api/git/release";
import ejs from "#core/ejs";
import Markdown from "#core/markdown";
import SemanticVersion from "#core/semantic-version";
import { resolve } from "#core/utils";

const TITLES = {
        "feat": "New features",
        "fix": "Bug fixes",
        "refactor": "Code refactoring",
    },
    DEFAULT_COMMIT_TYPES = {
        "feat": {
            "productionChange": true,
            "notableChange": true,
        },
        "fix": {
            "productionChange": true,
            "notableChange": true,
        },
    };

export default class GitChangelog {
    #changes;
    #upstream;
    #startRelease;
    #endRelease;
    #changesGroups;
    #notableChanges = 0;
    #report;

    constructor ( changes, { upstream, startRelease, endRelease, commitTypes } ) {
        this.#changes = changes;
        this.#upstream = upstream;
        this.#startRelease = startRelease;
        this.#endRelease = endRelease;

        this.#indexChanges( commitTypes || DEFAULT_COMMIT_TYPES );
    }

    // static
    static getTypeTitle ( type ) {
        return TITLES[ type ];
    }

    static convertMarkdownToText ( markdown, { ansi } = {} ) {
        return new Markdown( markdown ).toString( { ansi } ).trim();
    }

    // properties
    get startRelease () {
        return this.#startRelease;
    }

    get endRelease () {
        return this.#endRelease;
    }

    get changes () {
        return this.#changes;
    }

    get hasChanges () {
        return this.#changes.hasChanges;
    }

    get hasNotableChanges () {
        return Boolean( this.#notableChanges );
    }

    get hasBreakingChanges () {
        return this.#changes.hasBreakingChanges;
    }

    get hasFeatureChanges () {
        return this.#changes.hasFeatureChanges;
    }

    get hasFixChanges () {
        return this.#changes.hasFixChanges;
    }

    // public
    async createChangelog ( { endRelease, header, text, ansi = true } = {} ) {
        endRelease ||= this.#endRelease;

        var changelog = await ejs.renderFile( resolve( "#resources/templates/changelog.md.ejs", import.meta.url ), {
            "changelog": this,
            "changesGroups": this.#changesGroups,
            endRelease,
            "compareUrl": !this.#startRelease || !endRelease
                ? null
                : this.#upstream?.getCompareUrl( this.#startRelease.versionString, endRelease.versionString ),
        } );

        changelog = changelog.trim();

        if ( header ) {
            changelog = this.#createHeader( endRelease ) + "\n\n" + changelog;
        }

        if ( text ) {
            return this.convertMarkdownToText( changelog, { ansi, "linkify": true } );
        }
        else {
            return changelog;
        }
    }

    createChangesList ( { endRelease, text = true, ansi = true } = {} ) {
        endRelease ||= this.#endRelease;

        const lines = [ this.#createHeader( endRelease ) ];

        if ( this.hasChanges ) {
            for ( const group of this.#changesGroups ) {
                if ( !group.changes.length ) continue;

                lines.push( "", `**${ group.name }:**` );

                for ( const change of group.changes ) {
                    lines.push( `- ${ change.getChangelogSubject( {
                        "withSemanticVersionType": group.productionChange,
                        "withCommits": true,
                    } ) }` );
                }
            }
        }

        const changelog = lines.join( "\n" );

        if ( text ) {
            return this.convertMarkdownToText( changelog, { ansi, "linkify": true } );
        }
        else {
            return changelog;
        }
    }

    createReport () {
        if ( !this.#report ) {
            const lines = [];

            let titleLength = 0;

            lines.push( [ "Total changes", this.#changes.size ] );
            if ( titleLength < lines.at( -1 )[ 0 ].length ) titleLength = lines.at( -1 )[ 0 ].length;

            if ( this.#notableChanges ) {
                lines.push( [ "Notable changes", this.#notableChanges ] );
                if ( titleLength < lines.at( -1 )[ 0 ].length ) titleLength = lines.at( -1 )[ 0 ].length;
            }

            for ( const group of this.#changesGroups ) {
                if ( !group.changes.length ) continue;

                lines.push( [ group.name, group.changes.length ] );

                if ( titleLength < lines.at( -1 )[ 0 ].length ) titleLength = lines.at( -1 )[ 0 ].length;
            }

            this.#report = lines.map( ( [ title, count ] ) => `${ ( title + ":" ).padEnd( titleLength + 1 ) } ${ count || "-" }` ).join( "\n" );
        }

        return this.#report;
    }

    convertMarkdownToText ( markdown, { ansi, linkify } = {} ) {
        if ( linkify ) {
            markdown = this.linkifyMarkdown( markdown );
        }

        return new Markdown( markdown ).toString( { ansi } ).trim();
    }

    linkifyMarkdown ( text ) {
        if ( this.#upstream ) {
            text = this.#upstream.linkifyMarkdown( text );
        }

        return text;
    }

    createNextVersion ( preReleaseTag ) {
        const startRelease = this.startRelease || new GitRelease( SemanticVersion.initialVersion );

        try {
            const nextVersion = startRelease.increment( startRelease.isInitialVersion
                ? "patch"
                : this.hasBreakingChanges
                    ? "major"
                    : this.#changes.hasFeatureChanges
                        ? "minor"
                        : "patch", {
                preReleaseTag,
                "defaultPreReleaseTag": "alpha",
            } );

            return result( 200, nextVersion );
        }
        catch ( e ) {
            return result.fromError( e, { "log": false } );
        }
    }

    // private
    #indexChanges ( commitTypes ) {
        this.#changesGroups = [];

        // remove disabled commit types
        commitTypes = Object.entries( commitTypes ).reduce( ( commitTypes, [ key, value ] ) => {
            if ( value ) commitTypes[ key ] = value;

            return commitTypes;
        }, {} );

        // index production types
        const productionTypes = new Map();

        for ( const [ type, { title, productionChange } ] of Object.entries( commitTypes ) ) {
            if ( !productionChange ) continue;

            productionTypes.set( type, title || TITLES[ type ] || type.charAt( 0 ).toUpperCase() + type.slice( 1 ) );
        }

        // notable changes
        const notableChanges = this.#changes.getChanges( change => change.isBreakingChange || commitTypes[ change.type ]?.notableChange );
        this.#notableChanges += notableChanges.length;

        // breaking changes
        this.#changesGroups.push( {
            "name": "Breaking changes",
            "changes": this.#changes.getChanges( change => change.isBreakingChange ),
            "productionChange": true,
            "showAnnotatiion": true,
        } );

        // production changes
        for ( const [ type, title ] of productionTypes.entries() ) {
            this.#changesGroups.push( {
                "name": title,
                "changes": this.#changes.getChanges( change => !change.isBreakingChange && change.type === type ),
                "productionChange": true,
                "showAnnotatiion": true,
            } );
        }

        this.#changesGroups.push(

            // other changes
            {
                "name": "Other changes",
                "changes": this.#changes.getChanges( change => !change.isBreakingChange && !productionTypes.has( change.type ) && !change.isReleaseChange ),
                "productionChange": false,
                "showAnnotatiion": true,
            },

            // included pre-releases
            {
                "name": "Included pre-releases",
                "changes": this.#changes.getChanges( change => change.isReleaseChange ),
                "productionChange": false,
                "showAnnotatiion": false,
            }
        );
    }

    #createHeader ( endRelease ) {
        if ( this.#startRelease && endRelease ) {
            return `**Changes between the releases: \`${ this.#startRelease.versionString }\` (${ this.#startRelease.changelogDate }) ... \`${ endRelease.versionString }\` (${ endRelease.changelogDate })**`;
        }
        else if ( !this.#startRelease && endRelease ) {
            return `**Changes for the release: \`${ endRelease.versionString }\` (${ endRelease.changelogDate })**`;
        }
        else if ( this.#startRelease && !this.#endRelease ) {
            return `**Changes since the release: \`${ this.#startRelease.versionString }\` (${ this.#startRelease.changelogDate })**`;
        }
        else {
            return "**Changes since the initial commit**";
        }
    }
}
