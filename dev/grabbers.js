const request = require ('request-promise');
const auth = require ('./authentication.js');

const protocol = 'https://'
const hostname = 'api.cloogy.com'
const path = '/api/1.4'
const baseURI = `${protocol}${hostname}${path}`;

// awaits for the tokens and asks for a list of units
async function getUnits() {
    let token = await auth.getToken()
    const requestOptions = {
        uri: baseURI + '/units',
        method: 'GET',
        headers: {
            "Authorization": "ISA "+ token
        },
        json: true
    };

    let response = await request(requestOptions)
    .then (response => {
        console.log(response)
    })
}

// awaits for the tokens and asks for a list of devices. Optional argument with device's name (lets you know the ID)
async function getDevices(name) {
    let token = await auth.getToken()
    const requestOptions = {
        uri: baseURI + '/devices',
        method: 'GET',
        headers: {
            "Authorization": "ISA "+ token
        },
        json: true
    };
    let device;
    let response = await request(requestOptions)
    .then(response => {
        device = response.List.find(object => {
            return (object['Name'] === name)
            })
        //console.log(`${name} device found. Returning device's ID.`)
        //console.log(device['Id'])
        return (device['Id'])
        })
    .catch (err => {
        console.log(err)
        return response.List
    })
    return device['Id']
}

// awaits for the tokens and asks for a list of tags. Optional params query the server
async function getTags(where, order) {

    const token = await auth.getToken();
    let requestOptions = {
        uri: baseURI + '/tags',
        method: 'GET',
        headers: {
            "Authorization": "ISA "+ token
        },
        qs: { 
            where: undefined,
            order: undefined
        },
        json: true
    };
    if (where) {
        requestOptions.qs.where = where
    }
    if (order) {
        requestOptions.qs.order = order
    }
    let response = await request(requestOptions)
    .then(response => {
        return (response.List)
        })
    .catch (err => {
        console.log(err)
    })
    return response
}


async function getConsumption(granularity, to, from, tag) {
    const token = await auth.getToken();

    const requestOptions = {
        uri: baseURI + '/consumptions/' + granularity + '?to=' + to + '&from=' + from + '&tags=%5B' + tag + '%5D',
        method: 'GET',
        headers: {
            "Authorization": "ISA " + token
        },
        json: true
    }

    //console.log(requestOptions)
    const response = await request(requestOptions)
    .then (response => {
        //console.log(response)
        return response
    })
    .catch (err => {
        console.log(err)
    })
    return response
}

module.exports = { getUnits, getTags, getDevices, getConsumption }