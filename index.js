// initialize express and connect to mongodb server

var express = require('express');
var app = express();
var bodyParser = require('body-parser');
var mongoose = require('mongoose');
var port = 9999;

// connect to mongodb server
mongoose.connect('mongodb://mongo-express.cloudprint.127.0.0.1.nip.io/cloudprint');


const printJob = require('./Models/printJob');
mongoose.model("printJob", printJob);

// use body parser to get data from POST
app.use(bodyParser.urlencoded({extended: true}));
app.use(bodyParser.json());

app.post('/', function(req, res) {
    let status = req.body.status;
    let printerMAC = req.body.printerMAC;
    let statusCode = req.body.statusCode;
    let printingInProgress = req.body.printingInProgress;

    // if any of the required fields are missing, return an error
    if (!status || !printerMAC || !statusCode || !printingInProgress) {
        res.send("Error: Missing required fields" );
    }

    let responseBody = {
        hasPrintJob: false,
        mediaTypes: ["text/plain", "image/png"]
    };

    mongoose.get("printJob").find({status: "ópen"}, function(err, printJobs) {
        if (err) {
            res.send(err);
        }
        if (printJobs.length > 0) {
            responseBody.hasPrintJob = true;
            let printJob = printJobs[0];
            responseBody.printJobId = printJob.id;
            printJob.printer = printerMAC;
            printJob.status = "assigned";
            printJob.save(function(err) {
                if (err) {
                    res.send(err);
                }
            } );
        }

    });






});

app.get('/', function(req, res) {
    //get request parameters: token, mac, type
    let token = req.query.token;
    let mac = req.query.mac;
    let mediaType = req.query.type;

    // if any of the required fields are missing, return an error
    if (!token || !mac || !mediaType) {
        res.send("Error: Missing required fields", 404);
    }

    if(mediaType != "text/plain" && mediaType != "image/png") {
        res.send("Error: Unsupported media type", 415);
    }

    res.setHeader("X-Star-Buzzerstartpattern", "1");

    // find the printJob with the given token
    mongoose.get("printJob").find({token: token}, function(err, printJobs) {
        if (err || printJobs.length == 0) {
            res.send("Error or Not Found", 404);
        }

        if (mac != printJobs[0].printer) {
            res.send("Error: Invalid printer", 403);
        }

        let printJob = printJobs[0];
        printJob.status = "printing";
        printJob.save(function(err) {
            if (err) {
                res.send("Error", 404);
            }
        } );

        res.send(printJob.content);
    } );



} );

res.delete('/', function(req, res) {
    //get request parameters: token, mac, type, code
    let token = req.query.token;
    let mac = req.query.mac;
    let mediaType = req.query.type;
    let code = req.query.code;

    // if any of the required fields are missing, return an error
    if (!token || !mac || !mediaType || !code) {
        res.send("Error: Missing required fields", 404);
    }

    mongoose.get("printJob").find({token: token}, function(err, printJobs) {
        if (err || printJobs.length == 0) {
            res.send("Error or Not Found", 404);
        }

        let printJob = printJobs[0];

        if (mac != printJob.printer) {
            res.send("Error: Invalid printer", 403);

        }

        let status = "confirmed"
        if (code !== "OK") {
            status = "open";
        } else {
            printJob.finishedAt = Date.now();
        }


        printJob.status = status;
        printJob.save(function(err) {
            if (err) {
                res.send("Error", 404);
            }
        } );
    } );

    res.send("OK");
} );

app.listen(port);
console.log('Server running on port ' + port);

// expose app
exports = module.exports = app;