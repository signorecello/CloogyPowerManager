var https = require("https");
const actuators = require("./actuators.js");
const grabbers = require("./grabbers.js");
const chalk = require("chalk");
const EventEmitter = require("events");
const request = require("request-promise");

const { Client } = require("pg");

const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: true
});

const protocol = "https://";
const hostname = "api.cloogy.com";
const path = "/api/1.4";
const baseURI = `${protocol}${hostname}${path}`;

const availablePower = process.env.AVAILABLEPOWER; // magic number: available power in your house

let actuatedFromPowerManager = false; // flag to prevent it turning on the plug, if you're turning it off manually (or on schedule)
let protection = false; // flag, prevents quick succession trigger on/off. can be turned off by setting env variable to 0

let lastPlugPower = 0;

let token;
let refreshToken;
let tokenTimeout;

function grabToken() {
    return token;
}

// ok so I refreshed the code to feature Classes and the EventEmitter object. It makes the program lighter and more scalable.
// it also uses only one token & refresh token so I expect it to be faster and lighter
class Authentication extends EventEmitter {
    //this guy keeps aware of the token timeout and calls the refresh function if it runs out of time
    keepTrack() {
        if (Date.now > tokenTimeout) {
            this.refresh(refreshToken, token);
        }
    }

    //asks for a new token and refresh token, from the current token and refresh token
    async refresh(refreshToken, token) {
        const requestOptions = {
            uri: baseURI + "/session/refresh",
            method: "PUT",
            qs: {
                refresh_token: refreshToken,
                token: token
            },
            json: true
        };
        try {
            const response = await request(requestOptions);
            token = response.Token;
            refreshToken = response.RefreshToken;
            tokenTimeout = response.Timeout;
            console.log(token);
            console.log(refreshToken);
        } catch (error) {
            console.log(error);
        }
    }

    // the first get token function, only called once I hope
    async getToken() {
        const requestOptions = {
            uri: baseURI + "/sessions",
            method: "POST",
            body: {
                Login: process.env.LOGIN,
                Password: process.env.PASSWORD
            },
            json: true
        };

        try {
            const response = await request(requestOptions);
            token = response.Token;
            refreshToken = response.RefreshToken;
            tokenTimeout = response.Timeout;
            return;
        } catch (error) {
            console.log(
                chalk.redBright.bold.underline(
                    `Error (request token): ${error}`
                )
            );
            process.exit();
        }
    }
}

// monitors for the active feeds, returns the average of the readings
class sendFeedRequestAndParse extends EventEmitter {
    constructor(token, tag) {
        super();
        this.agent = new https.Agent({
            keepAlive: true
        });
        this.readings = []; // an array of numbers to contain all the numbers to be averaged
        this.headers = {
            Authorization: "VPS " + token,
            Accept: "application/json",
            Agent: this.agent,
            "Cache-Control": "no-cache"
        };
        this.options = {
            host: hostname,
            path: `${path}/activefeeds?tags=%5B${tag[0]["Id"]}%5D`,
            headers: this.headers
        };
        this.req = https.request(this.options, res => {
            console.log(chalk.blue(`Starting connection ${tag[0]["Id"]}`));
            console.log(`STATUS: ${res.statusCode}`);
            console.log(`HEADERS: ${JSON.stringify(res.headers)}.`);
            res.setEncoding("utf8");
            res.on("data", chunk => {
                //console.log(chunk)
                this.read = parseFloat(chunk.slice(45, -2)); // magic numbers: slicing the first 45 chars
                // beware because it slices the first 45 chars, so if you intend to draw more than 9,99kw, you need to slice only 44
                if (!isNaN(this.read)) {
                    this.readings.push(this.read);
                }
            });
            // emits an event in case connection ends/errors
            res.on("end", () => {
                console.log(
                    chalk.blueBright(`No more data in response. Restarting...`)
                );
                this.emit("connection ended");
                res.destroy();
            });
            res.on("error", error => {
                console.log(
                    chalk.redBright.bold.underline(`Error: ${error.message}`)
                );
                this.emit("connection error");
                res.destroy();
            });
        });
        this.req.on("error", e => {
            console.error(
                chalk.redBright.bold.underline(
                    `problem with request: ${e.message}`
                )
            );
            this.emit("connection error");
        });
        this.req.end();
    }
}

// the device protection feature: if the plug is turned off due to high usage, it prevents the plug to turn on right away
// this is because sometimes your house power usage just goes down for a little bit and you don't want it to turn on and turn down immediately
// this feature DEFINITELY needs a little bit of work since after the timeout the device will behave like described above...
class DeviceProtection extends EventEmitter {
    startTimeout() {
        this.timeout = setTimeout(() => {
            protection = false;
            client.query(
                `UPDATE status SET status='${protection}'`,
                (err, res) => {
                    if (err) throw err;
                    for (let row of res.rows) {
                        console.log(row);
                        protection = row.status;
                        console.log(protection);
                    }
                }
            );
        }, process.env.DEVICE_PROTECTION_TIMEOUT);
    }

    execute() {
        protection = true;
        client.query(`UPDATE status SET status='${protection}'`, (err, res) => {
            if (err) throw err;
            for (let row of res.rows) {
                console.log(row);
                protection = row.status;
                console.log(protection);
            }
        });
        this.startTimeout();
    }

    renewTimeout() {
        clearTimeout(this.timeout);
        this.startTimeout();
    }
}

const deviceProtection = new DeviceProtection();

async function getAverageAndActuate() {
    const auth = new Authentication();
    await auth.getToken();
    auth.keepTrack();

    await client.query(`SELECT * FROM status`, async (err, res) => {
        if (err) throw err;
        for (let row of res.rows) {
            console.log(row);
            if (row.status === true) {
                await actuators.actuate(token, 1);
            }
        }
    });
    // initiating the classes (and send the requests)
    let unitTag = await grabbers.getTags(token, "Id=150308");
    let plugTag = await grabbers.getTags(token, "Id=150313");
    let unit = new sendFeedRequestAndParse(token, unitTag);
    let plug = new sendFeedRequestAndParse(token, plugTag);
    let timePassed = 0;
    let timeout = process.env.READINGSFREQUENCY; // grabs env variable
    setInterval(async function() {
        // ok so this is a bit of a mess but that's the best I could do:
        // if you restart the requests, the event listeners will no longer be registered with the emitter so the next "connection ended"
        // will not trigger a new request. but if you register them inside of the setInterval() they'll end up stacking and will send LOTS of requests once the event triggers
        // so in each iteration I remove all the listeners and add them again. I'm sure there's a better way around, but this does the trick
        unit.removeAllListeners();
        unit.on("connection ended", () => {
            console.log("connection ended (unit)");
            unit = undefined;
            unit = new sendFeedRequestAndParse(token, unitTag);
        });
        unit.on("connection error", () => {
            console.log("connection error (unit)");
            unit = undefined;
            unit = new sendFeedRequestAndParse(token, unitTag);
        });
        plug.removeAllListeners();
        plug.on("connection ended", () => {
            console.log("connection ended (plug)");
            plug = undefined;
            plug = new sendFeedRequestAndParse(token, plugTag);
        });
        plug.on("connection error", () => {
            console.log("connection error (plug)");
            plug = undefined;
            plug = new sendFeedRequestAndParse(token, plugTag);
        });
        let averageUnit =
            unit.readings.reduce((a, b) => a + b, 0) / unit.readings.length;
        let averagePlug =
            plug.readings.reduce((a, b) => a + b, 0) / plug.readings.length;
        let actuatorState = await actuators.getActuatorState(token);
        console.log(chalk.green(`Number of readings: ${unit.readings.length}`));
        console.log(`Average unit power: ${averageUnit}`);
        console.log(`Average plug power: ${averagePlug}`);
        unit.readings = [];
        plug.readings = [];
        ++timePassed;
        minutes = (timePassed * (timeout / 1000)) / 60;
        console.log(`Elapsed time: ${minutes} minutes\n`);
        // if actuator's state is ON and average power is bigger than you can manage, it turns off the plug
        // the actuatedFromPowerManager flag lets the program know you didn't do it manually so it keeps going
        console.log(`Plug is ${actuatorState}`);
        if (protection) {
            console.log(
                `Protection is ON (${process.env.DEVICE_PROTECTION_TIMEOUT /
                    1000 /
                    60} minutes)`
            );
        } else {
            console.log(`Protection is OFF`);
        }
        if (actuatorState === "On") {
            if (averageUnit > availablePower) {
                lastPlugPower = averagePlug;
                console.log(
                    chalk.red(`Device turned off due to Power Manager`)
                );
                console.log(chalk.red(`Last plug power: ${lastPlugPower}`));
                actuators.actuate(token, 0);
                actuatedFromPowerManager = true;
                deviceProtection.execute();
            }
        } else {
            // turns the plug back on if your average consumption + the instant power you were drawing from the plug
            // is less than the available power, and if device protection is OFF
            if (
                averageUnit + lastPlugPower < availablePower &&
                actuatedFromPowerManager === true &&
                protection === false
            ) {
                console.log(
                    chalk.red(
                        `Available power can handle the plug power. Turning actuator ON.`
                    )
                );
                console.log(chalk.red(`Expected plug power: ${lastPlugPower}`));
                actuatedFromPowerManager = false;
                actuators.actuate(token, 1);
            }
            if (protection === true && averageUnit > availablePower) {
                deviceProtection.renewTimeout();
            }
        }
    }, timeout);
}

let actuatorState1 = "On";
let actuatorState2 = "Off";

async function powerManager(data) {
    client.connect();
    // if you activate the plug manually, the actuatedFromPowerManager flag is still false,
    // so it keeps waiting for changes
    if (actuatedFromPowerManager === false) {
        async function waitForChanges() {
            if (data === "firstBoot") {
                actuatorState1 = "firstBoot";
            } else actuatorState1 = await actuators.getActuatorState(token);

            actuatorState2 = "Off";

            if (actuatorState1 === actuatorState2) {
                setTimeout(waitForChanges, 1000);
                return;
            }
            actuatorState2 = actuatorState1;
            getAverageAndActuate();
        }
        waitForChanges();
    }
}

module.exports = { grabToken, powerManager, client };

powerManager("firstBoot");
