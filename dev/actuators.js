const request = require ('request-promise');
const auth = require ('./authentication.js');
const grabbers = require ('./grabbers.js')
const chalk = require ('chalk')

const protocol = 'https://'
const hostname = 'api.cloogy.com'
const path = '/api/1.4'
const baseURI = `${protocol}${hostname}${path}`;

// awaits for the ID of the actuator and for the tokens, and asks for it's state
async function getActuatorState() {
    const token = await auth.getToken()
    const actuatorID = await grabbers.getTags('Id=150315');
    const requestOptions = {
        uri: baseURI + '/actuatorstate/' + actuatorID[0].Id,
        method: 'GET',
        headers: {
            "Authorization": "ISA " + token
        },
        json: true
    }
    const response = await request(requestOptions)
    try {
        //console.log(`Actuator state: ${response['State']}`)
        return response['State']
    }
    catch (error) {
        console.log(chalk.redBright.bold.underline(`Error (request actuatorstate): ${error}`))
        process.exit()
    }
}

// if state is ON turn OFF, etc
async function actuate(command) {
    const token = await auth.getToken();
    const actuator = await grabbers.getTags('Id=150315');
    const actuatorState = await getActuatorState();
    const requestOptions = {
        uri: baseURI + "/actuations",
        method: 'POST',
        headers: {
            "Authorization": "ISA "+ token
        },
        body: {
            "TagIds": [actuator[0].Id],
            "Command": command
        },
        json: true
    };
        
    const response = await request(requestOptions)
    .then(response => {
        if (command === 1) {
            console.log('Device turned on!')
        } else if (command === 0){
            console.log('Device turned off')
        } else if (command === 3) {
            console.log('Device toogled')
        } else {
            console.log('Unknown actuator command')
        }
    })
    .catch(error => {
        console.log(chalk.redBright.bold.underline(`Error (request actuate): ${error}`))
        process.exit()
    })
}

module.exports = { getActuatorState, actuate }