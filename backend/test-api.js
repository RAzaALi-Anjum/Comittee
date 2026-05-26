const http = require('http');

const options = {
    hostname: 'localhost',
    port: 5000,
    path: '/api/profile/27TOzPPipgRUHriLKUyOR7WwpwZ2',
    method: 'GET'
};

const req = http.request(options, res => {
    let rawData = '';
    res.on('data', chunk => { rawData += chunk; });
    res.on('end', () => {
        console.log(`STATUS: ${res.statusCode}`);
        console.log(`BODY: ${rawData}`);
    });
});

req.on('error', e => {
    console.error(`Problem with request: ${e.message}`);
});

req.end();
