const http = require('http');
const https = require('https');
const express = require('express');
// const fs = require('fs');
const path = require('path');
// const klawSync = require('klaw-sync');
// const crypto = require('crypto');
const app = express();

require('dotenv').config();

const MailSlurp = require("mailslurp-client").default;
const mailslurp = new MailSlurp({ apiKey: process.env.MAILSLURP_KEY });

const vowels_list = [ 'a', 'e', 'i', 'o', 'u' ];
const consonants_list = [ 'b', 'c', 'd', 'f', 'g', 'h', 'k', 'l', 'm', 'n', 'p', 'r', 's', 't', 'v', 'z' ];

function isIterable(obj) {
    if (obj == null) {
        return false;
    }
    return typeof obj[Symbol.iterator] === 'function';
}

function sendResponse(res, response) {
    if ( response !== null ) {
        res.send(response);
    } else {
        res.status(502).json({
            error: 'Something went wrong'
        });
    }
}

function getRandomIntInclusive(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1) + min);
}

function getUsername() {
    let username_output = '';
    let username_output_length = 8;

    while ( username_output.length < username_output_length ) {
        username_output += consonants_list[ getRandomIntInclusive( 0, consonants_list.length - 1 ) ];
        username_output += vowels_list[ getRandomIntInclusive( 0, vowels_list.length - 1 ) ];
    }

    return username_output;
}

function getPassword() {
    let password_output = '';
    let password_output_length = 12;

    const range = (start, stop, step) => Array.from({ length: (stop - start) / step + 1}, (_, i) => start + (i * step));

    let ranges = [
        range(48, 57, 1), // number range
        range(65, 90, 1), // small letters range
        range(97, 122, 1) // capital letters range
    ];

    while ( password_output.length < password_output_length ) {
        let selected_range = getRandomIntInclusive( 0, 2 );
        password_output += String.fromCharCode( ranges[ selected_range ][ getRandomIntInclusive( 0, ranges[ selected_range ].length - 1 ) ] );
    }

    return password_output;
}

async function getEmail() {
    const inbox = await mailslurp.inboxController.createInbox({
        name: 'John Doe',
        useDomainPool: true,
        expiresIn: 4320000,
    });
    // console.log(inbox);
    
    const returnValues = {
        'id': inbox.id,
        'email': inbox.emailAddress
    };
    
    return returnValues;
}

function getRESTDownloads(download_id, username, password) {

    return new Promise((resolve, reject) => {
        
        let options_headers = '';
        let options_path = '/wp-json/passgen/v1/';
        let options_method = '';
        const credentials = username + ':' + password;

        if ( download_id === null ) {
            options_path += 'downloads';
            options_headers = {
                'Content-Type': 'application/json',
                'Authorization': 'Basic ' + Buffer.from( credentials ).toString( 'base64' )
            };
            options_method = 'POST';
        } else {
            options_path += 'download/' + download_id;
            options_headers = {
                'Content-Type': 'application/json',
            };
            options_method = 'GET';
        }
        // console.log(options_path);

        const options = {
            host: process.env.REST_HOST,
            port: 443,
            path: options_path,
            method: options_method,
            headers: options_headers
        };
        // console.log(options);

        const port = options.port == 443 ? https : http;
    
        let output = '';
    
        const req = port.request(options, (res) => {
            // console.log('STATUS: ' + res.statusCode);
            // console.log('HEADERS: ' + JSON.stringify(res.headers));
            
            res.setEncoding('utf8');
        
            res.on('data', (chunk) => {
                output += chunk;
            });
        
            res.on('end', () => {
                // console.log(JSON.parse(output));
                resolve(JSON.parse(output));
                
                // onResult(res.statusCode, obj);
            });
        });
        
        req.on('error', (err) => {
            reject('error: ' + err.message);
        });
        
        req.end();
    });

}

async function getDownloadsObject(download_id = null, include_url = false, username = null, password = null) {
    const downloads_response = await getRESTDownloads(download_id, username, password);
    // console.log(downloads_response);

    if ( isIterable(downloads_response) ) {

        let response = [];
        
        for ( const res_object of downloads_response ) {
            let loop_output = {
                hash: res_object.slug,
                filenames: []
            };
            
            for ( const download_object of res_object.download_object ) {
                
                if ( include_url ) {
                    loop_output.filenames.push({
                        'filename': download_object.filename,
                        'url': download_object.url
                    });
                } else {
                    loop_output.filenames.push({
                        'filename': download_object.filename
                    });
                }
            }
    
            response.push(loop_output);
        }

        return response;
    }

    return null;

}

async function getFileObject(download_id, filename) {
    const download_response = await getDownloadsObject(download_id, true);
    // console.log(download_response);
    let response = '';

    for ( const res_object of download_response ) {
        for ( const download_object of res_object.filenames ) {
            if ( download_object.filename === filename ) {
                response = download_object.url;
            }
        } 
    }

    return response;
}

app.use(express.json());
app.use(express.static("express"));
app.use(express.urlencoded({
    extended: true
}));

app.get('/api/v1/download/:id', async (req, res) => {
    const response = await getDownloadsObject(req.params.id);

    res.send(response);
});

app.post('/api/v1/downloads', async (req, res) => {
    // console.log(req.body);
    const response = await getDownloadsObject(null, false, req.body.username, req.body.password);
    // res.send(response);
    sendResponse(res, response);
});

app.get('/download/:id/file/:file_id', async (req, res) => {
    res.redirect(await getFileObject(req.params.id, req.params.file_id));
});

app.get('/download/:id', (req, res) => {
    res.sendFile(path.join(__dirname + '/express/download.html'));
});

app.get('/download', (req, res) => {
    res.sendFile(path.join(__dirname + '/express/download.html'));
});

app.get('/generate/username', (req, res) => {
    // console.log(req);
    res.send(getUsername());
});

app.get('/generate/password', (req, res) => {
    // console.log(req);
    res.send(getPassword());
});

app.get('/generate/email', async (req, res) => {
    // console.log(req);
    res.send(await getEmail());
});

app.get('/generate', (req, res) => {
    res.sendFile(path.join(__dirname + '/express/generate.html'));
});

app.use('/', (req, res) => {
    res.sendFile(path.join(__dirname + '/express/index.html'));
});

const server = http.createServer(app);
const port = 8080;
server.listen(port, '127.0.0.1');
console.debug('Server listening on port ' + port);

// function getDirFiles(arg_dirpath) {
//     const files = klawSync(arg_dirpath, {nodir: true});
//     // console.log(files);
//     return files;
// }

// function getUIFilesName(arg_files) {
//     let names = [];
    
//     for (const file of arg_files) {
//         let fileNameUI = '';
//         const fileNameRaw = file.path.split('/');
//         // console.log(fileNameRaw);
//         const index = fileNameRaw.findIndex((element) => element === 'download') + 1;
//         // console.log(index);
//         for (let i = index; i < fileNameRaw.length; i++) {
//             fileNameUI = fileNameUI + '/' + fileNameRaw[i];
//         }

//         names.push(fileNameUI);
//     }

//     return names;
// }

// function getFilesHash(arg_files) {
//     let hashes = [];

//     for (const file of arg_files) {
//         hashes.push(crypto.createHash('md5').update(file.path).digest('hex'));
//     }

//     return hashes;
// }

// function getFilesUrl(arg_hashes, req) {
//     let urls = [];
    
//     for (const hash of arg_hashes) {
//         urls.push(req.protocol + '://' + req.get('host') + req.originalUrl + '/' + hash);
//     }
//     console.log(urls);
//     return urls;
// }

// function findFileByHash(arg_hash, arg_files) {
//     // console.log(arg_files);
//     for (const file of arg_files) {
//         // console.log(file.path);
//         if (arg_hash === crypto.createHash('md5').update(file.path).digest('hex')) {
//             return file.path;
//         }
//     }
// }





// app.get('/file/:id', (req, res) => {
//     const filePath = findFileByHash(req.params.id, getDirFiles(path.join(__dirname + '/express/download')));
//     const fileName = filePath.split('/').pop();
//     const options = {
//         headers: {
//             "Content-Disposition": "attachment; filename=" + fileName
//         }
//     };
//     // console.log(options);
//     res.sendFile(filePath, options);
// });
// app.get('/file', (req, res) => {
//     const response = {
//         'names': getUIFilesName(getDirFiles(path.join(__dirname + '/express/download'))),
//         'urls': getFilesUrl(getFilesHash(getDirFiles(path.join(__dirname + '/express/download'))), req)
//     };
    
//     res.send(response);
//     // res.send(getFilesUrl(getFilesHash(getDirFiles(path.join(__dirname + '/express/download'))), req));
// });


