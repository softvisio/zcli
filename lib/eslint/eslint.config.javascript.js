import mixins from "#core/mixins";
import EslintConfig from "./config.js";
import Comments from "./configs/comments.js";
import Corejslib from "./configs/corejslib.js";
import DeMorgan from "./configs/de-morgan.js";
import Eslint from "./configs/eslint.js";
import Globals from "./configs/globals.js";
import Import from "./configs/import.js";
import LanguageOptions from "./configs/language-options.js";
import MathConfig from "./configs/math.js";
import PromiseConfig from "./configs/promise.js";
import RegexpConfig from "./configs/regexp.js";
import Stylistic from "./configs/stylistic.js";
import Unicorn from "./configs/unicorn.js";

export default class Config extends mixins(

    //
    LanguageOptions,
    Globals,
    Stylistic,
    Import,
    Unicorn,
    MathConfig,
    DeMorgan,
    PromiseConfig,
    RegexpConfig,
    Corejslib,
    Comments,
    Eslint,
    EslintConfig
) {}
