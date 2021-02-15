'use strict';

const util      = require('util');
const minimist  = require('minimist');

require('./globals');

/////////////////////////////////////////////////////////////////
// module exports
/////////////////////////////////////////////////////////////////
class Common {    
    constructor() {
        this.module_log_level  = {};
    }
    init( options ) {
        this.argv = minimist(process.argv.slice(2));
        for( let o of options ) {
            const option_name = o[0];
            if( option_name in this.argv ) {
                // Cast the option value to the type of the default value
                this.argv[option_name] = o[2].constructor(this.argv[option_name]);
            }
            else {
                // Give the option default value
                this.argv[option_name] = o[2];
            }
        }
        return this;
    }
    log( level, ...args ) {
        if( this.argv.loglevel >= level ) {
            const local_time = (new Date()).toLocaleString('en-US',{hour12:false});
            console.log(`${local_time}:${level}: ` + util.format(...args));
        }
        return this;
    }
    module_log( module, level, ...args ) {
        const modname  = module ? (module.filename||"default").replace(/^.+\/([^/\.]+)\.[^\.]+$/,"$1") : "default"; // eslint-disable-line no-useless-escape
        const loglevel = (modname in this.module_log_level) ? this.module_log_level[modname] : this.argv.loglevel;
        if( loglevel>=level ) {
            const local_time = (new Date()).toLocaleString('en-US',{hour12:false});
            console.log(`${local_time}:${level}: ` + util.format(modname,...args));
        }
        return this;
    }
    log_stack() {
        console.log((new Error()).stack);
    }
    is_promise( o ) {
        return (typeof o === 'object') && (typeof o.then === 'function') && (typeof o.catch === 'function');
    }
}

module.exports = new Common();
