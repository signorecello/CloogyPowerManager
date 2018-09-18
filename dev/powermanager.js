var https = require ('https'); // for the buffer request
const auth = require ('./authentication.js'); // grabs tokens and other stuff
const actuators = require ('./actuators.js') // to find actuators and actuate them
const grabbers = require ('./grabbers.js') // grabs tags, devices, actuatorsIDs, etc
const chalk = require ('chalk')
const EventEmitter = require ('events')

const protocol = 'https://'
const hostname = 'api.cloogy.com'
const path = '/api/1.4'

const availablePower = process.env.AVAILABLEPOWER; // magic number: available power in your house
let readings = []; // an array of numbers to contain all the numbers to be averaged

let actuatedFromPowerManager = false; // flag to prevent it turning on the plug, if you're turning it off manually (or on schedule)
let protection = false; // flag, prevents quick succession trigger on/off. can be turned off by setting env variable to 0


let instantPlugPower;
let lastPlugPower;



// monitors for the active feeds, returns the average of the readings

async function sendFeedRequestAndParseUnit() {
    const token = await auth.getToken() // a token for authentication
    let activePowerTag
    activePowerTag = await grabbers.getTags('Id=150308') 
    var agent = new https.Agent({ 
        keepAlive: true
    })
    var headers = {
        'Authorization': 'VPS ' + token,
        'Accept': 'application/json',
        'Agent': agent,
        'Cache-Control': 'no-cache'
    };
    var options = {
        host: hostname,
        path: `${path}/activefeeds?tags=%5B${activePowerTag[0]['Id']}%5D`,
        headers: headers
    }
    // now for the fun part: receives the data as string, slices it and parses to a fload, 
    // if the reading is good, adds it to the array
    const req = https.request(options, (res) => {
        console.log(chalk.blue('Starting connection for UNIT'))
        console.log(`STATUS: ${res.statusCode}`);
        console.log(`HEADERS: ${JSON.stringify(res.headers)}.`);
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
            //console.log(chunk)
            read = parseFloat(chunk.slice(45, -2)); // magic numbers: slicing the first 45 chars
            // beware because it slices the first 45 chars, so if you intend to draw more than 9,99kw, you need to slice only 44
            if (!isNaN(read)) {
            readings.push(read);
            }
        });
        // if connection ends (after 10minutes), ask again
        res.on('end', () => {
            console.log(chalk.blueBright(`No more data in response (unit). Restarting...`));
            sendFeedRequestAndParseUnit();
            res.destroy();
        });
        res.on('error', (error) => {
            console.log(chalk.redBright.bold.underline(`Error (unit): ${error.message}`))
            sendFeedRequestAndParseUnit();
            res.destroy();
        })
    });
    
    req.on('error', (e) => {
        console.error(chalk.redBright.bold.underline(`problem with request (unit): ${e.message}`));
        process.exit()
    });
    
    req.end()
}

async function sendFeedRequestAndParsePlug() {
    const token = await auth.getToken() // a token for authentication
    let activePowerTag
    activePowerTag = await grabbers.getTags('Id=150313') 
    var agent = new https.Agent({ // keepalive agent because it's a buffer
        keepAlive: true
    })
    var headers = {
        'Authorization': 'VPS ' + token,
        'Accept': 'application/json',
        'Agent': agent,
        'Cache-Control': 'no-cache'
    };
    var options = {
        host: hostname,
        path: `${path}/activefeeds?tags=%5B${activePowerTag[0]['Id']}%5D`,
        headers: headers
    }
    // now for the fun part: receives the data as string, slices it and parses to a fload, 
    // if the reading is good, adds it to the array
    const req = https.request(options, (res) => {
        console.log(chalk.blue(`Starting connection for PLUG`))
        console.log(`STATUS: ${res.statusCode}`);
        console.log(`HEADERS: ${JSON.stringify(res.headers)}
        `);
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
            read = parseFloat(chunk.slice(45, -2)); // magic numbers: slicing the first 45 chars
            // beware because it slices the first 45 chars, so if you intend to draw more than 9,99kw, you need to slice only 44
            if (!isNaN(read)) instantPlugPower = read;
        });
        // if connection ends (after 10minutes), ask again
        res.on('end', () => {
            console.log(chalk.blueBright(`No more data in response (unit). Restarting...`));
            sendFeedRequestAndParsePlug();
            res.destroy();
        });
        res.on('error', (error) => {
            console.log(chalk.redBright.bold.underline(`Error (unit): ${error.message}`))
            sendFeedRequestAndParsePlug();
            res.destroy();
        })
    });
    
    req.on('error', (e) => {
        console.error(chalk.redBright.bold.underline(`problem with request (unit): ${e.message}`));
        process.exit()
    });
    
    req.end()
}


class DeviceProtection extends EventEmitter {
    execute () {
        setTimeout(() => {
            protection = false;
        }, process.env.DEVICE_PROTECTION_TIMEOUT)
    }
}

const deviceProtection = new DeviceProtection

async function getAverageAndActuate() {
    sendFeedRequestAndParseUnit()
    sendFeedRequestAndParsePlug()
    let average;
    let timePassed = 0;
    let timeout = process.env.READINGSFREQUENCY; // twelve seconds
    // this monitors the readings and gets an average
    // then it gets the instant consumption from the plug
    setInterval(async function() {
        average = readings.reduce((a,b) => a + b, 0) / readings.length;
        console.log(chalk.green(`Number of readings: ${readings.length}`))
        console.log(`Average: ${average}`);
        console.log(`Instant plug power: ${instantPlugPower}`)
        readings = []
        ++timePassed
        minutes = timePassed * (timeout/1000)/60
        console.log(`Elapsed time: ${minutes} minutes\n`)
        // if actuator's state is ON and average power is bigger than you can manage, it turns off the plug
        // the actuatedFromPowerManager flag lets the program know you didn't do it manually so it keeps going
        let actuatorState = await actuators.getActuatorState()
        if (actuatorState === 'On') {
            if (average > availablePower) {
                lastPlugPower = instantPlugPower;
                console.log(chalk.red(`Device turned off due to Power Manager`))
                console.log(chalk.red(`Last plug power: ${lastPlugPower}`))
                actuators.actuate(0)
                actuatedFromPowerManager = true;
                deviceProtection.execute()
            }
        } else {
        // turns the plug back on if your average consumption + the instant power you were drawing from the plug
        // is less than the available power
            if (average + lastPlugPower < availablePower && actuatedFromPowerManager === true) {
                console.log(chalk.red(`Available power can handle the plug power. Turning actuator ON.`))
                console.log(chalk.red(`Expected plug power: ${lastPlugPower}`))
                actuatedFromPowerManager = false;
                actuators.actuate(1)
            }
        }
    
    }, timeout)
}






let actuatorState1 = 'On'
let actuatorState2 = 'Off'

async function powerManager (data) {
    // if you activate the plug manually, the actuatedFromPowerManager flag is still false, 
    // so it keeps waiting for changes
    if (actuatedFromPowerManager === false) {
        async function waitForChanges() {
            if (data === 'firstBoot') {
                actuatorState1 = 'firstBoot'
            } else actuatorState1 = await actuators.getActuatorState()

            actuatorState2 = 'Off';

            if (actuatorState1 === actuatorState2) {
                setTimeout(waitForChanges, 1000)
                return
            }
            actuatorState2 = actuatorState1;
            getAverageAndActuate()
        }
    waitForChanges()
    }
}



module.exports = { powerManager }

//test()
powerManager('firstBoot')