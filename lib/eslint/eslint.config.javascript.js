import mixins from "#core/mixins";
import EslintConfig from "./config.js";
import CommentsPlugin from "./configs/comments.js";
import CorejslibPlugin from "./configs/corejslib.js";
import DeMorganPlugin from "./configs/de-morgan.js";
import EslintPlugin from "./configs/eslint.js";
import GlobalsPlugin from "./configs/globals.js";
import ImportPlugin from "./configs/import-x.js";
import LanguageOptionsPlugin from "./configs/language-options.js";
import MathPlugin from "./configs/math.js";
import PromisePlugin from "./configs/promise.js";
import RegexpPlugin from "./configs/regexp.js";
import SimpleImportSortPlugin from "./configs/simple-import-sort.js";
import StylisticPlugin from "./configs/stylistic.js";
import UnicornPlugin from "./configs/unicorn.js";

export default class EslintConfigJavaScript extends mixins(

    //
    LanguageOptionsPlugin,
    GlobalsPlugin,
    StylisticPlugin,
    ImportPlugin,
    SimpleImportSortPlugin,
    UnicornPlugin,
    MathPlugin,
    DeMorganPlugin,
    PromisePlugin,
    RegexpPlugin,
    CorejslibPlugin,
    CommentsPlugin,
    EslintPlugin,
    EslintConfig
) {}
