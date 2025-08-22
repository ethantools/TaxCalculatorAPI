# Tax calculator API
API for calculating net income or tax breakdown.

The API is deployed live at: https://netincomecalculator.netlify.app/.netlify/functions/taxcalculator

# Example GET Request
To get the net income you can make a GET request on:
https://netincomecalculator.netlify.app/.netlify/functions/taxcalculator/netincome/:year/:gross/:status/:state/:dependents/:retirement

To get the tax breakdown you can make a GET request on: 
https://netincomecalculator.netlify.app/.netlify/functions/taxcalculator/taxbreakdown/:year/:gross/:status/:state/:dependents/:retirement