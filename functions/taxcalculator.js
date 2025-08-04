const express = require('express')
const serverless = require('serverless-http')
const axios = require('axios')
const cheerio = require('cheerio')
const app = express()
const router = express.Router();
const fs = require('fs');
const path = require('path');

const { getLastFridayOrNonHolidayDate, dateToUnixTimestampPlusADay, dateToUnixTimestamp, formatDateToMatchApiArgument } = require('./helpers.js');

const headers = {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Mobile Safari/537.36',
}
  
router.get('/', (req, res) => {
    res.json('Welcome to the tax calculator API')
})

function getTaxData(year, state) {
    const federal = JSON.parse(fs.readFileSync(path.join(__dirname, `../functions/tax_data/${year}/federal.json`)));
    const fica = JSON.parse(fs.readFileSync(path.join(__dirname, `../functions/tax_data/${year}/fica.json`)));
    const stateData = JSON.parse(fs.readFileSync(path.join(__dirname, `../functions/tax_data/${year}/state/${state}.json`)));
    return { federal, fica, state: stateData };
}

function calculateBracketTax(brackets, gross) {
    let tax = 0;
    for (let i = 0; i < brackets.length; i++) {
        const lower = brackets[i].bracket;
        const upper = brackets[i + 1] ? brackets[i + 1].bracket : gross;
        if (gross > lower) {
            tax += Math.min(gross, upper) - lower > 0 ? (Math.min(gross, upper) - lower) * brackets[i].rate : 0;
        }
    }
    return tax;
}

function calculateFica(fica, gross, status) {
    // Social Security
    const ssTax = Math.min(gross, fica.social_security.cap) * fica.social_security.rate;
    // Medicare
    let medicareTax = gross * fica.medicare.rate;
    if (gross > fica.medicare.thresholds[status]) {
        medicareTax += (gross - fica.medicare.thresholds[status]) * fica.medicare.additional_rate;
    }
    return { ssTax, medicareTax };
}

router.get('/netincome/:gross/:status/:state', (req, res) => {
    const year = '2025';
    const { gross, status, state } = req.params;
    const grossIncome = parseFloat(gross);
    if (!['single', 'married'].includes(status)) return res.status(400).json({ error: 'Invalid status' });

    try {
        const { federal, fica, state: stateData } = getTaxData(year, state.toUpperCase());
        const fedTax = calculateBracketTax(federal[status], grossIncome);
        const stateTax = calculateBracketTax(stateData[status], grossIncome);
        const { ssTax, medicareTax } = calculateFica(fica, grossIncome, status);

        const netIncome = grossIncome - fedTax - stateTax - ssTax - medicareTax;
        res.json({ netIncome: netIncome.toFixed(2) });
    } catch (err) {
        res.status(500).json({ error: 'Tax data not found for provided state.' });
    }
});


router.get('/taxbreakdown/:gross/:status/:state', (req, res) => {
    const year = '2025';
    const { gross, status, state } = req.params;
    const grossIncome = parseFloat(gross);
    if (!['single', 'married'].includes(status)) return res.status(400).json({ error: 'Invalid status' });

    try {
        const { federal, fica, state: stateData } = getTaxData(year, state.toUpperCase());
        const fedTax = calculateBracketTax(federal[status], grossIncome);
        const stateTax = calculateBracketTax(stateData[status], grossIncome);
        const { ssTax, medicareTax } = calculateFica(fica, grossIncome, status);

        res.json({
            federal: fedTax.toFixed(2),
            state: stateTax.toFixed(2),
            social_security: ssTax.toFixed(2),
            medicare: medicareTax.toFixed(2)
        });
    } catch (err) {
        res.status(500).json({ error: 'Tax data not found for provided state.' });
    }
});

app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', true);
    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
    } else {
      next();
    }
  });
  

app.use('/.netlify/functions/taxcalculator', router)



module.exports.handler=serverless(app)

//remove commented code from below for local testing
//module.exports = router;

