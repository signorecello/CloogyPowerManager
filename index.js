const express = require("express");
const app = express();
const powermanager = require("./dev/powermanager.js");
const actuators = require("./dev/actuators.js");
const port = process.env.PORT;
var http = require("http"); // for the buffer request
const chalk = require("chalk");
var bodyParser = require("body-parser");

app.use(bodyParser.json()); // support json encoded bodies
app.use(bodyParser.urlencoded({ extended: true })); // support encoded bodies

app.get("/", function(req, res) {
    res.json("Power manager starting (check console).");
    //powermanager.powerManager('firstBoot')
    res.end();
});

app.post("/actuate", async function(req, res) {
    pass = req.body.weakPass;
    if (pass === process.env.REMOTE_ACTUATION_PASS) {
        let token = await powermanager.grabToken();
        await actuators.actuate(token, 3);
        res.json("Plug actuated!");
        res.end();
    }
});

setInterval(function() {
    http.get("http://cloogypm.herokuapp.com/");
}, 300000); // every 5 minutes (300000)

app.listen(port, function() {
    console.log(chalk.cyan(`Listening on port ${port}`));
});
