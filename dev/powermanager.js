var https = require ('https'); // for the buffer request
const auth = require ('./authentication.js'); // grabs tokens and other stuff
const actuators = require ('./actuators.js') // to find actuators and actuate them
const grabbers = require ('./grabbers.js') // grabs tags, devices, actuatorsIDs, etc

const protocol = 'https://'
const hostname = 'api.cloogy.com'
const path = '/api/1.4'

const availablePower = process.env.AVAILABLEPOWER; // magic number: available power in your house
let readings = []; // an array of numbers to contain all the numbers to be averaged
let time = Date.now() // for the getconsumptions call

let actuatedFromPowerManager = false; // flag to prevent it turning on the plug, if you're turning it off manually (or on schedule)
let running = false; // another flag

// monitors for the active feeds, returns the average of the readings
async function sendFeedRequestAndParse() {
    let activePowerTag = await grabbers.getTags('Id=150308') // finds the tag for the active power
    const token = await auth.getToken() // a token for authentication
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
        console.log(`STATUS: ${res.statusCode}`);
        console.log(`HEADERS: ${JSON.stringify(res.headers)}`);
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
            read = parseFloat(chunk.slice(45, -2)); // magic numbers: slicing the first 45 chars
            // beware because it slices the first 45 chars, so if you intend to draw more than 9,99kw, you need to slice only 44
            if (!isNaN(read)) {
            readings.push(read);
            }
        });
        // if connection ends (after 10minutes), ask again
        res.on('end', () => {
            console.log('No more data in response. Restarting...');
            sendFeedRequestAndParse();
        });
        res.on('error', (error) => {
            console.log(`Error: ${error.message}`)
        })
        });
    
        req.on('error', (e) => {
            console.error(`problem with request: ${e.message}`);
        });
        
        req.end()
}

// keeps track of the average and actuates plug if over availablePower
async function getAverageAndActuate() {
    if (running === true) {
        sendFeedRequestAndParse()
        let average;
        let timePassed = 0;
        let timeout = process.env.READINGSFREQUENCY; // twelve seconds
        // this monitors the readings and gets an average
        // then it gets the instant consumption from the plug
        setInterval(async function() {
            average = readings.reduce((a,b) => a + b, 0) / readings.length;
            if (isNaN(average)) sendFeedRequestAndParse() // some error handling
            plugPower = await grabbers.getConsumption('instant', time, time - 900000, 150313)
            .then (response => plugPower = response[0]['Read'])
            console.log(`Number of readings: ${readings.length}`)
            readings = []
            console.log(`Average: ${average}`);
            ++timePassed
            minutes = timePassed * (timeout/1000)/60
            console.log(`Elapsed time: ${minutes} minutes`)
            // if actuator's state is ON and average power is bigger than you can manage, it turns off the plug
            // the actuatedFromPowerManager flag lets the program know you didn't do it manually so it keeps going
            let actuatorState = await actuators.getActuatorState()
            if (actuatorState === 'On') {
                if (average > availablePower) {
                    console.log('Device turned off due to Power Manager')
                    actuators.actuate(0)
                    actuatedFromPowerManager = true;
                }
            } else {
            // turns the plug back on if your average consumption + the instant power you were drawing from the plug
            // is less than the available power
                if (average + plugPower < availablePower && actuatedFromPowerManager === true) {
                    console.log('Available power can handle the plug power. Turning actuator ON.')
                    actuatedFromPowerManager = false;
                    actuators.actuate(1)
                }
            }
        }, timeout)
    }
}

async function powerManager () {
    // if you activate the plug manually, the actuatedFromPowerManager flag is still false, 
    // so it keeps waiting for changes
    if (actuatedFromPowerManager === false) {
        async function waitForChanges() {
            let actuatorState1 = await actuators.getActuatorState()
            let actuatorState2 = 'Off';
            if (actuatorState1 === actuatorState2) {
                setTimeout(waitForChanges, 1000)
                return
            }
            actuatorState2 = actuatorState1;
            running = true;
            getAverageAndActuate();
    }

    waitForChanges()
}
}
getAverageAndActuate()
powerManager()