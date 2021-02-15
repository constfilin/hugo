#!/usr/bin/env node

"use strict";

const crypto       = require('crypto');
const express      = require('express');
const bodyparser   = require('body-parser');
require("body-parser-csv")(bodyparser);
const Client       = require('mongodb').MongoClient;

const common       = require('./common');

class Server {
    constructor() {
    }
    async init( config_file ) {
        // If this throws out then a async promise will be failed and it will be caught by the caller
        this.config = require(common.argv.config_file);
        // Translate RegExp patterns into RegExp objects
        this.config.validators = Object.map(this.config.validators,k=>k,(k,v)=>new RegExp(v));
        // Connect to DB
        this.mongoclient = new Client(this.config.dbconnection,{useUnifiedTopology: true});
        await this.mongoclient.connect();
        this.mongodb = this.mongoclient.db(this.config.dbconnection.replace(/^.+\/([^\/]+)$/,"$1")); // eslint-disable-line no-useless-escape
        return this; // for chaining????
    }
}

//////////////////////////////////////////////////////////////////////////////////////////////
// module globals
//////////////////////////////////////////////////////////////////////////////////////////////
common.init([
    ["loglevel"     , "defines verbosity",2],
    ["port"         , "port to listen on",9888],
    ["config_file"  , "means what it seems to be meaning","./config.json"],
]);

// Since the uploaders can upload huge files (the file size really depends on the client and server buffer sizes,
// see https://stackoverflow.com/questions/5053290/large-file-upload-though-html-form-more-than-2-gb), we do not
// use JSON body parser - this can potentially create OOM situation at the server. However i am not sure how to
// control NodeJS HTTP body reader buffer size.. Does NodeJS even have this limitation?
//
// How else to we support huge files? How about letting users gzip them before submittal? Great idea but we will have
// to gunzip them before reading. While gunzipping can certainly be done in NodeJS, I'd just do it in NGINX proxying
// the requests to this NodeJS express app. This is because we would need NGINX proxy anyway if only for the reason
// of loading balancing the upload requests to NodeJS backends. How to configure NGINX proxy to gunzip HTTP request is
// described (for example) here: https://stackoverflow.com/questions/29766154/nginx-gunzip-post-requests-to-backend
const app = express();
app.use(bodyparser.csv({
    csvParseOptions : {
        fastcsvParams : {
            headers: false,
            trim: true
        }
    }
}));

const server = new Server();
server.init().then( () => {
    common.log(1,`server is initialized`);
}).catch( err => {
    common.log(0,`Cannot init server`,err);
    process.exit(-1);
});

//////////////////////////////////////////////////////////////////////////////////////////////
// utils
//////////////////////////////////////////////////////////////////////////////////////////////
const send_response = ( req, res, result ) => {
    const send_result = ( result ) => {
        if( Array.isArray(result) ) {
            const elems_to_log = 3;
            const slice_to_log = result.slice(0,elems_to_log);
            common.module_log(module,1,`${req.method} to ${req.originalUrl}:`,slice_to_log,`(${result.length} elems)`);
        }
        else {
            common.module_log(module,1,`${req.method} to ${req.originalUrl}:`,result);
        }
        res.send(result);
        return result;
    };
    const cleanup_err = ( err ) => {
        // Make sure to remove all stack and tec details
        return {
            err              : err.message,
        };
    }
    // Convert result to something that we can send
    if( typeof result === 'function' ) {
        try {
            result = result();
        }
        catch( err ) {
            common.module_log(module,0,`exception on function `,err);
            return send_result(cleanup_err(err));
        }
    }
    if( common.is_promise(result) ) {
        return result.then(send_result).catch( err => {
            common.module_log(module,0,`exception on promise `,err);
            return send_result(cleanup_err(err));
        });
    }
    return send_result(result);
}

//////////////////////////////////////////////////////////////////////////////////////////////
// file upload api
//////////////////////////////////////////////////////////////////////////////////////////////
const upload = ( query, body ) => {
    
    // authentication first
    if( !(query.u in server.config.uploaders) )
        throw Error(`Uploader '${query.u}' is unknown`);
    const pre_image = `u=${query.u},ts=${query.ts},psk=${server.config.uploaders[query.u].psk}`;
    const image     = crypto.createHash('sha256').update(pre_image).digest('base64');
    if( image!==query.signature )
        throw Error(`Uploader '${query.u}' didn't sign its request`);

    // Body is an array of arrays. Each inner array is a line in CSV file
    const uploader  = server.config.uploaders[query.u];
    // Let's map the each line in the array into a document insertable into Mongo
    const documents = body.map( (line,lineno) => {
        if( line.length!==uploader.columns_order.length )
            throw Error(`Length of line #${lineno} is not expected ${uploader.columns_order.length}}`);
        return Object.map(
            line,
            (ndx,v) => {
                const field_name = uploader.columns_order[ndx];
                // UUID is supposed to be the ID of the record. In Mongo it means _id
                // Let's map UUID into _id
                return (field_name==="UUID") ? '_id' : field_name;
            },
            (ndx,v) => {
                const field_name = uploader.columns_order[ndx];
                const field_re   = server.config.validators[field_name];
                if( field_re ) {
                    if( !field_re.test(v) )
                        throw Error(`On line #${lineno} value '${v}' of field '${field_name}' does not comply with validation`);
                }
                return v;
            }
        );
    });
    return server.mongodb.collection(query.u).insertMany(documents).then( result => {
        return result.result;
    });
};

app.post('/api/upload',(req,res) => {
    return send_response(req,res,() => {
        return upload(req.query,req.body);
    });
});

app.listen(common.argv.port);

common.module_log(module,0,`Started at port ${common.argv.port} at log level ${common.argv.loglevel}`);
