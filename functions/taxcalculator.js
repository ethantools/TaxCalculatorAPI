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
    const federal = JSON.parse(fs.readFileSync(path.join(__dirname, `tax_data/${year}/federal.json`)));
    const fica = JSON.parse(fs.readFileSync(path.join(__dirname, `tax_data/${year}/fica.json`)));
    const stateData = JSON.parse(fs.readFileSync(path.join(__dirname, `tax_data/${year}/state/${state.toUpperCase()}.json`)));
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

function calculateFica(fica, gross, filing_status) {
    // Social Security
    const ssTax = Math.min(gross, fica.social_security.cap) * fica.social_security.rate;
    // Medicare
    let medicareTax = gross * fica.medicare.rate;
    if (gross > fica.medicare.thresholds[filing_status]) {
        medicareTax += (gross - fica.medicare.thresholds[filing_status]) * fica.medicare.additional_rate;
    }
    return { ssTax, medicareTax };
}


// Updated: Add dependents argument and apply deductions/exemptions

// Updated: Add 'retirement' argument and logic
router.get('/netincome/:year/:gross/:status/:state/:dependents/:retirement', (req, res) => {
    const { year, gross, status, state, dependents, retirement } = req.params;
    const tax_year = parseInt(year) || 2025; // Default to 2025 if not provided
    const grossIncome = parseFloat(gross);
    const filing_status = req.params.status.toLowerCase();
    const numDependents = parseInt(dependents) || 0;
    const retirementPct = parseFloat(retirement) || 0;
    if (!['single', 'married'].includes(filing_status)) return res.status(400).json({ error: 'Invalid status' });

    try {
        const { federal, fica, state: stateData } = getTaxData(tax_year, state);

        // Deduct pre-tax retirement contribution
        const retirementContribution = grossIncome * (retirementPct / 100);
        const adjustedGross = grossIncome - retirementContribution;

        // --- Federal deductions and exemptions ---
        let fedTaxable = adjustedGross;
        let fedCredits = 0;
        if (federal.standard_deduction && federal.standard_deduction[filing_status] != null) {
            fedTaxable -= federal.standard_deduction[filing_status];
        }
        if (federal.personal_exemption && federal.personal_exemption[filing_status]) {
            const pe = federal.personal_exemption[filing_status];
            if (pe.credit) fedCredits += pe.amount;
            else fedTaxable -= pe.amount;
        }
        if (federal.personal_exemption && federal.personal_exemption.dependent) {
            const depEx = federal.personal_exemption.dependent;
            const depTotal = depEx.amount * numDependents;
            if (depEx.credit) fedCredits += depTotal;
            else fedTaxable -= depTotal;
        }
        fedTaxable = Math.max(0, fedTaxable);
        const fedTax = Math.max(0, calculateBracketTax(federal[filing_status], fedTaxable) - fedCredits);

        // --- State deductions and exemptions ---
        let stateTaxable = adjustedGross;
        let stateCredits = 0;
        if (stateData.standard_deduction && stateData.standard_deduction[filing_status] != null) {
            stateTaxable -= stateData.standard_deduction[filing_status];
        }
        if (stateData.personal_exemption && stateData.personal_exemption[filing_status]) {
            const pe = stateData.personal_exemption[filing_status];
            if (pe.credit) stateCredits += pe.amount;
            else stateTaxable -= pe.amount;
        }
        if (stateData.personal_exemption && stateData.personal_exemption.dependent) {
            const depEx = stateData.personal_exemption.dependent;
            const depTotal = depEx.amount * numDependents;
            if (depEx.credit) stateCredits += depTotal;
            else stateTaxable -= depTotal;
        }
        stateTaxable = Math.max(0, stateTaxable);
        const stateTax = Math.max(0, calculateBracketTax(stateData[filing_status], stateTaxable) - stateCredits);

        // FICA (still based on original gross income)
        const { ssTax, medicareTax } = calculateFica(fica, grossIncome, filing_status);

        const netIncome = grossIncome - retirementContribution - fedTax - stateTax - ssTax - medicareTax;
        res.json({ netIncome: netIncome.toFixed(2) });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Tax data not found for provided state.' });
    }
});



// Updated: Add dependents argument and apply deductions/exemptions

// Updated: Add 'retirement' argument and logic
router.get('/taxbreakdown/:gross/:status/:state/:dependents/:retirement', (req, res) => {
    const { year, gross, status, state, dependents, retirement } = req.params;
    const tax_year = parseInt(year) || 2025; // Default to 2025 if not provided
    const grossIncome = parseFloat(gross);
    const filing_status = req.params.status.toLowerCase();
    const numDependents = parseInt(dependents) || 0;
    const retirementPct = parseFloat(retirement) || 0;
    if (!['single', 'married'].includes(filing_status)) return res.status(400).json({ error: 'Invalid status' });

    try {
        const { federal, fica, state: stateData } = getTaxData(tax_year, state);

        // Deduct pre-tax retirement contribution
        const retirementContribution = grossIncome * (retirementPct / 100);
        const adjustedGross = grossIncome - retirementContribution;

        // --- Federal deductions and exemptions ---
        let fedTaxable = adjustedGross;
        let fedCredits = 0;
        if (federal.standard_deduction && federal.standard_deduction[filing_status] != null) {
            fedTaxable -= federal.standard_deduction[filing_status];
        }
        if (federal.personal_exemption && federal.personal_exemption[filing_status]) {
            const pe = federal.personal_exemption[filing_status];
            if (pe.credit) fedCredits += pe.amount;
            else fedTaxable -= pe.amount;
        }
        if (federal.personal_exemption && federal.personal_exemption.dependent) {
            const depEx = federal.personal_exemption.dependent;
            const depTotal = depEx.amount * numDependents;
            if (depEx.credit) fedCredits += depTotal;
            else fedTaxable -= depTotal;
        }
        fedTaxable = Math.max(0, fedTaxable);
        const fedTax = Math.max(0, calculateBracketTax(federal[filing_status], fedTaxable) - fedCredits);

        // --- State deductions and exemptions ---
        let stateTaxable = adjustedGross;
        let stateCredits = 0;
        if (stateData.standard_deduction && stateData.standard_deduction[filing_status] != null) {
            stateTaxable -= stateData.standard_deduction[filing_status];
        }
        if (stateData.personal_exemption && stateData.personal_exemption[filing_status]) {
            const pe = stateData.personal_exemption[filing_status];
            if (pe.credit) stateCredits += pe.amount;
            else stateTaxable -= pe.amount;
        }
        if (stateData.personal_exemption && stateData.personal_exemption.dependent) {
            const depEx = stateData.personal_exemption.dependent;
            const depTotal = depEx.amount * numDependents;
            if (depEx.credit) stateCredits += depTotal;
            else stateTaxable -= depTotal;
        }
        stateTaxable = Math.max(0, stateTaxable);
        const stateTax = Math.max(0, calculateBracketTax(stateData[filing_status], stateTaxable) - stateCredits);

        const { ssTax, medicareTax } = calculateFica(fica, grossIncome, filing_status);

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

// Add this route temporarily for debugging
router.get('/debug/files', (req, res) => {
    const dir = path.join(__dirname, 'tax_data/2025/state');
    try {
        const files = fs.readdirSync(dir);
        res.json({ files });
    } catch (err) {
        res.status(500).json({ error: err.message });
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

