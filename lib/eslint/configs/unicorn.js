import eslintUnicorn from "eslint-plugin-unicorn";

const configs = {
    "default": [
        {
            "name": "unicorn",
            "plugins": {
                "unicorn": eslintUnicorn,
            },
            "rules": {
                "unicorn/consistent-arrow-return-style": "error",
                "unicorn/consistent-template-literal-escape": "error",
                "unicorn/escape-case": "error",
                "unicorn/no-zero-fractions": "error",
                "unicorn/number-literal-case": [
                    "error",
                    {
                        "hexadecimalValue": "uppercase",
                    },
                ],
                "unicorn/numeric-separators-style": [
                    "error",
                    {
                        "onlyIfContainsSeparator": false,
                        "binary": {
                            "minimumDigits": 0,
                            "groupLength": 4,
                        },
                        "hexadecimal": {
                            "minimumDigits": 8,
                            "groupLength": 4,
                        },
                        "number": {
                            "minimumDigits": 5,
                            "groupLength": 3,
                        },
                        "octal": {
                            "minimumDigits": 0,
                            "groupLength": 4,
                        },
                    },
                ],

                // NOTE: duplicate "import/enforce-node-protocol-usage"
                "unicorn/prefer-node-protocol": "error",

                "unicorn/prefer-unicode-code-point-escapes": "error",
                "unicorn/single-line-block-comment-style": [ "error", "multiline" ],
                "unicorn/text-encoding-identifier-case": "error",
            },
        },
    ],
    "refactoring": [
        {
            "name": "unicorn/refactoring",
            "rules": {

                // FIXME [engine:node@>=26.0.0]: "unicorn/prefer-iterator-concat": "error",
                // FIXME [engine:node@>=26.0.0]: "unicorn/prefer-temporal": "error",
                // FIXME [engine:node@>=26.0.0]: "unicorn/prefer-iterator-to-array": "error",
                // FIXME [engine:node@>=26.0.0]: "unicorn/prefer-iterator-to-array-at-end": "error",
                // FIXME [engine:node@>=26.0.0]: "unicorn/prefer-uint8array-hex": "error",

                "unicorn/catch-error-name": [
                    "error",
                    {
                        "name": "e",
                    },
                ],
                "unicorn/class-reference-in-static-methods": "error",
                "unicorn/consistent-assert": "error",
                "unicorn/consistent-compound-words": "error",
                "unicorn/consistent-date-clone": "error",
                "unicorn/expiring-todo-comments": "error",
                "unicorn/explicit-timer-delay": "error",
                "unicorn/iteration-fallback-style": "error",
                "unicorn/new-for-builtins": "error",
                "unicorn/no-accessor-recursion": "error",
                "unicorn/no-accidental-bitwise-operator": "error",
                "unicorn/no-array-sort-for-min-max": "error",
                "unicorn/no-async-promise-finally": "error",
                "unicorn/no-boolean-sort-comparator": "error",
                "unicorn/no-chained-comparison": "error",
                "unicorn/no-double-comparison": "error",
                "unicorn/no-duplicate-logical-operands": "error",
                "unicorn/no-duplicate-loops": "error",
                "unicorn/no-duplicate-set-values": "error",
                "unicorn/no-exports-in-scripts": "error",
                "unicorn/no-instanceof-builtins": "error",
                "unicorn/no-invalid-well-known-symbol-methods": "error",
                "unicorn/no-late-event-control": "error",
                "unicorn/no-length-as-slice-end": "error",
                "unicorn/no-loop-iterable-mutation": "error",
                "unicorn/no-multiple-promise-resolver-calls": "error",
                "unicorn/no-named-default": "error",
                "unicorn/no-negated-array-predicate": "error",
                "unicorn/no-redundant-comparison": "error",
                "unicorn/no-subtraction-comparison": "error",
                "unicorn/no-unnecessary-array-flat-depth": "error",
                "unicorn/no-unnecessary-array-splice-count": "error",
                "unicorn/no-unnecessary-await": "error",
                "unicorn/no-unnecessary-nested-ternary": "error",
                "unicorn/no-unnecessary-splice": "error",
                "unicorn/no-unnecessary-string-trim": "error",
                "unicorn/no-unsafe-buffer-conversion": "error",
                "unicorn/no-unsafe-promise-all-settled-values": "error",
                "unicorn/no-unused-array-method-return": "error",
                "unicorn/no-unused-iterator-helper": "error",
                "unicorn/no-useless-boolean-cast": "error",
                "unicorn/no-useless-collection-argument": "error",
                "unicorn/no-useless-concat": "error",
                "unicorn/no-useless-error-capture-stack-trace": "error",
                "unicorn/no-useless-fallback-in-spread": "error",
                "unicorn/no-useless-re-export": "error",
                "unicorn/no-useless-spread": "error",
                "unicorn/no-useless-undefined": "error",
                "unicorn/prefer-abort-signal-any": "error",
                "unicorn/prefer-abort-signal-timeout": "error",
                "unicorn/prefer-array-flat-map": "error",
                "unicorn/prefer-array-from-async": "error",
                "unicorn/prefer-array-from-map": "error",
                "unicorn/prefer-array-last-methods": "error",
                "unicorn/prefer-bigint-literals": "error",
                "unicorn/prefer-block-statement-over-iife": "error",
                "unicorn/prefer-class-fields": "error",
                "unicorn/prefer-classlist-toggle": "error",
                "unicorn/prefer-code-point": "error",
                "unicorn/prefer-date-now": "error",
                "unicorn/prefer-dom-node-append": "error",
                "unicorn/prefer-dom-node-remove": "error",
                "unicorn/prefer-error-is-error": "error",
                "unicorn/prefer-get-or-insert-computed": "error",
                "unicorn/prefer-global-this": "error",
                "unicorn/prefer-group-by": "error",
                "unicorn/prefer-import-meta-properties": "error",
                "unicorn/prefer-iterable-in-constructor": "error",
                "unicorn/prefer-iterator-helpers": "error",
                "unicorn/prefer-math-constants": "error",
                "unicorn/prefer-modern-math-apis": "error",
                "unicorn/prefer-negative-index": "error",
                "unicorn/prefer-number-properties": [
                    "error",
                    {
                        "checkInfinity": false,
                        "checkNaN": false,
                    },
                ],
                "unicorn/prefer-optional-catch-binding": "error",
                "unicorn/prefer-promise-try": "error",
                "unicorn/prefer-queue-microtask": "error",
                "unicorn/prefer-regexp-test": "error",
                "unicorn/prefer-response-static-json": "error",
                "unicorn/prefer-set-has": "error",
                "unicorn/prefer-set-methods": "error",
                "unicorn/prefer-set-size": "error",
                "unicorn/prefer-simplified-conditions": "error",
                "unicorn/prefer-single-replace": "error",
                "unicorn/prefer-split-limit": "error",
                "unicorn/prefer-string-match-all": "error",
                "unicorn/prefer-string-pad-start-end": "error",
                "unicorn/prefer-string-replace-all": "error",
                "unicorn/prefer-string-slice": "error",
                "unicorn/prefer-string-starts-ends-with": "error",
                "unicorn/prefer-string-trim-start-end": "error",
                "unicorn/prefer-structured-clone": "error",
                "unicorn/prefer-then-catch": "error",
                "unicorn/prefer-unary-minus": "error",
                "unicorn/relative-url-style": "error",
                "unicorn/require-module-attributes": "error",
                "unicorn/require-module-specifiers": "error",
            },
        },
    ],
    "experimental": [
        {
            "name": "unicorn/experimental",
            "rules": {

                // XXX "unicorn/consistent-optional-chaining": "error",
                // XXX "unicorn/no-array-reduce": "error",
                // XXX "unicorn/no-await-expression-member": "error",
                // XXX "unicorn/no-for-each": "error",
                // XXX "unicorn/no-this-outside-of-class": "error",
                // XXX "unicorn/no-unreadable-object-destructuring": "error",
                // XXX "unicorn/prefer-direct-iteration": "error",

                // XXX experimental
                // "unicorn/no-barrel-files": "error",
                // "unicorn/no-immediate-mutation": "error",

                // ERROR: can break third-party code
                "unicorn/prefer-at": "off",

                // ERROR: combines consecutive push() calls into one, not safe for stream.push()
                "unicorn/prefer-single-call": "off",

                // ERROR: can break browser code (extjs.js)
                "unicorn/prefer-modern-dom-apis": "off",

                // ERROR: too complex to maintain
                "unicorn/require-array-sort-compare": "off",

                // ERROR: dangerous to use
                "unicorn/no-unnecessary-global-this": "off",

                // ERROR: affect code readability
                "unicorn/no-lonely-if": "off",
                "unicorn/no-useless-continue": "off",
                "unicorn/prefer-string-repeat": "off",
                "unicorn/prefer-string-raw": "off",
                "unicorn/no-break-in-nested-loop": "off",
            },
        },
    ],
    "overrides": [
        {
            "name": "unicorn overrides",
            "rules": {
                "import/enforce-node-protocol-usage": "off",
            },
        },
    ],
};

export default Super =>
    class extends Super {

        // protected
        _createConfig () {
            const config = super._createConfig();

            config.push( ...configs.default );

            if ( this.refactoring ) {
                config.push( ...configs.refactoring );
            }

            if ( this.experimental ) {
                config.push( ...configs.experimental );
            }

            return config;
        }

        _createOverrides () {
            const config = super._createOverrides();

            config.push( ...configs.overrides );

            return config;
        }
    };
