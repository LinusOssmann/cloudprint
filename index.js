require('dotenv').config();
const basicAuth = require('express-basic-auth')
const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');

let app = express();
const port = process.env.EXPOSE_PORT || 9999;

const clientAuthInstance = basicAuth({
    users: {[process.env.CLOUDPRINT_AUTH_USER]: process.env.CLOUDPRINT_AUTH_PWD},
    challenge: true,
})

const jobCreatorAuthInstance = basicAuth({
    users: {[process.env.CREATE_AUTH_USER]: process.env.CREATE_AUTH_PWD},
    challenge: true,
})

app.use(bodyParser.urlencoded({extended: true}));
app.use(bodyParser.json());

const mongoDB = process.env.MONGODB_URI || 'mongodb://localhost:27017/cloudprint';
mongoose.connect(mongoDB);
const printJob = require('./Models/printJob');
const printJobCollection = mongoose.model("printJob", printJob);

//implement basic auth for all routes accept /printjobs
app.use(function (req, res, next) {
    if (req.path === "/printjobs") {
        jobCreatorAuthInstance(req, res, next);
        return;
    } else {
        clientAuthInstance(req, res, next);
    }
} );

app.post('/', async function (req, res) {
    let status = req.body.status;
    let printerMAC = req.body.printerMAC;
    let statusCode = req.body.statusCode;
    let printingInProgress = req.body.printingInProgress;

    if (!status || !printerMAC || !statusCode) {
        console.log("Error: Missing required fields", req.body);
        return res.send("Error: Missing required fields");
    }

    let responseBody = {
        jobReady: false,
        mediaTypes: ["text/plain"]
    };

    let printJob = await printJobCollection.findOne({status: "open"});

    if (printJob && !printingInProgress) {
        responseBody.jobReady = true;
        responseBody.jobToken = printJob.id;

        printJob.printer = printerMAC;
        printJob.status = "assigned";
        await printJob.save();
    }

    console.log("PrintJob sent", responseBody)
    return res.json(responseBody);
});

app.get('/', async function (req, res) {
    let token = req.query.token;
    let mac = req.query.mac;
    let mediaType = req.query.type;

    if (!mac || !mediaType) {
        return res.status(404).send("Error: Missing required fields");
    }
    if (mediaType !== "text/plain" && mediaType !== "image/png") {
        return res.status(415).send("Error: Unsupported media type");
    }

    let printJobs = await printJobCollection.find({printer: mac, status: "assigned"});
    if (printJobs.length === 0) {
        return res.status(403).send("Error: Invalid token");
    }
    if (mac != printJobs[0].printer) {
        return res.status(403).send("Error: Invalid printer");
    }

    let printJob = printJobs[0];
    printJob.status = "printing";
    await printJob.save();

    res.setHeader("X-Star-Document-Type", "StarLine");
    res.setHeader("Content-Type", "text/plain");

    return res.send(printJob.content);
});

app.delete('/', async function (req, res) {
    //get request parameters: token, mac, type, code
    let token = req.query.token;
    let mac = req.query.mac;
    let mediaType = req.query.type;
    let code = req.query.code;

    // if any of the required fields are missing, return an error
    if (!token || !mac || !mediaType || !code) {
        return res.status(404).send("Error: Missing required fields");
    }

    let printJobs = await printJobCollection.find({id: token});
    let printJob = printJobs[0];
    if (mac != printJob.printer) {
        return res.status(403).send("Error: Invalid printer");
    }

    let status = "confirmed"
    if (code !== "OK") {
        status = "open";
    } else {
        printJob.finishedAt = Date.now();
    }

    printJob.status = status;
    await printJob.save();

    return res.send("OK");
});

app.post('/printjobs', async function (req, res) {
    basicAuth({
        users: {[process.env.CLOUDPRINT_AUTH_USER]: process.env.CLOUDPRINT_AUTH_PWD},
        challenge: true,
    })

    let printJob = new printJobCollection();
    printJob.content = req.body.content;
    printJob.status = "open";
    printJob.createdAt = Date.now();
    printJob.id = Math.floor(Math.random() * 1000000000);
    await printJob.save();

    res.json({message: "PrintJob created"});
});

app.listen(port);
console.log('Server running on port ' + port);
exports = module.exports = app;