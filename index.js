"use strict";
const request = require('request'),
	util = require('util'),
	requestPromise = util.promisify(request),
	xsenv = require('@sap/xsenv');

const _private = {
		_getUAACredentials: async() => {
			const credentials = xsenv.getServices({
				credentials: {
					tag: "xsuaa"
				}
			}).credentials;

			return credentials;
		},
		_getDestinationCredentials: async() => {
			const credentials = xsenv.getServices({
				credentials: {
					tag: "destination"
				}
			}).credentials;

			return credentials;
		},
		_getConnectivityCredentials: async() => {
			const credentials = xsenv.getServices({
				credentials: {
					tag: "connectivity"
				}
			}).credentials;

			return credentials;
		},

		_getDestination: async(sDestinationName, sDestToken) => {
			try {

				const oDestinationCredentials = await _private._getDestinationCredentials();

				const oOptionsGetDestination = {
					url: oDestinationCredentials.uri + '/destination-configuration/v1/destinations/' + sDestinationName,
					headers: {
						'Authorization': 'Bearer ' + sDestToken
					}
				}
				const oDestResult = await requestPromise(oOptionsGetDestination);
				return JSON.parse(oDestResult.body);

			} catch (err) {

				throw new Error('Error - _getDestination - ' + err);
			}

		},

		_getDestinationToken: async() => {
			try {

				const oDestinationCredentials = await _private._getDestinationCredentials();
				const oUAACredentials = await _private._getUAACredentials();
				const oOptionsPostDestination = {
					url: oUAACredentials.url + '/oauth/token',
					method: 'POST',
					headers: {
						'Authorization': 'Basic ' + Buffer.from(oDestinationCredentials.clientid + ':' + oDestinationCredentials.clientsecret).toString(
							'base64'),
						'Content-type': 'application/x-www-form-urlencoded'
					},
					form: {
						'client_id': oDestinationCredentials.clientid,
						'grant_type': 'client_credentials'
					}
				}

				const oDestResult = await requestPromise(oOptionsPostDestination);

				const sDestToken = JSON.parse(oDestResult.body).access_token;

				return sDestToken;
			} catch (err) {
				throw new Error('Error - _getDestinationToken - ' + err);
			}

		},
		_getConnectivityToken: async() => {
			try {
				const oConnectivityCredentials = await _private._getConnectivityCredentials();
				const oUAACredentials = await _private._getUAACredentials();

				const oOptionsPostConnectivity = {
					url: oUAACredentials.url + '/oauth/token',
					method: 'POST',
					headers: {
						'Authorization': 'Basic ' + Buffer.from(oConnectivityCredentials.clientid + ':' + oConnectivityCredentials.clientsecret).toString(
							'base64'),
						'Content-type': 'application/x-www-form-urlencoded'
					},
					form: {
						'client_id': oConnectivityCredentials.clientid,
						'grant_type': 'client_credentials'
					}
				}

				const oConnResult = await requestPromise(oOptionsPostConnectivity),
					sConnToken = JSON.parse(oConnResult.body).access_token;
				return sConnToken;
			} catch (err) {
				throw new Error('Error - _getConnectivityToken - ' + err);
			}

		},

		_RequestSCP: async(oOptions, sAuthToken, sConnectivityToken, oDestination) => {
			try {
				const oStdHeaders = {
					"Proxy-Authorization": "Bearer " + sConnectivityToken
				};

				let oHeader;
				//Check of authTokens aanwezig zijn, dan deze gebruiken.
				if (oDestination && oDestination.authTokens) {
					const sValue = oDestination.authTokens[0].value,
						sType = oDestination.authTokens[0].type;
					oHeader = {
						'Authorization': `${sType} ${sValue}`
					}
				} else {
					oHeader = {
						"SAP-Connectivity-Authentication": "Bearer " + sAuthToken
					}
				}
				
			/* Pas vanaf Node v8 beschikbaar.	
			const oHeaders = {...oStdHeaders,
					...oOptions.headers,
					...oHeader
				}; */

				const oHeaders =  Object.assign(oStdHeaders, oOptions.headers, oHeader);

				const oConnectivityCredentials = await _private._getConnectivityCredentials();

				const oOptionsProxy = {
					method: oOptions.method,
					url: oDestination.destinationConfiguration.URL + oOptions.url, //sEndpoint,
					proxy: `http://${oConnectivityCredentials.onpremise_proxy_host}:${oConnectivityCredentials.onpremise_proxy_port}`,
					//proxy: `http://${sOnPremise_Proxy_Host}:${sOnPremise_Proxy_Port}`,
					headers: oHeaders,
					json: oOptions.json
				};

				const oSCPRequestResult = await requestPromise(oOptionsProxy);
				return oSCPRequestResult;
			} catch (err) {
				throw new Error('Error - _RequestSCP - ' + err);
			}
		},

		_fetchCsrfToken: async(oOptions, sAuthToken, sConnectivityToken, oDestination) => {

			try {

				const oOptionsFetch = {
					url: encodeURI(oOptions.url),
					headers: {
						"x-csrf-token": "Fetch",
						"strictSSL": false,
						"secureProtocol": "TLSv1_method"
					},
					method: "OPTIONS",
					rejectUnauthorized: false
				}

				const oFetchedToken = await _private._RequestSCP(oOptionsFetch, sAuthToken, sConnectivityToken, oDestination)
					//console.log('oFetchedToken'+JSON.stringify(oFetchedToken) );

				let oHeaders = new Object();
				oHeaders["x-csrf-token"] = oFetchedToken.headers["x-csrf-token"];
				if(oFetchedToken.headers['set-cookie']){
					oHeaders.Cookie = oFetchedToken.headers['set-cookie'].join(";");
				}
				return oHeaders;

			} catch (err) {
				throw ('Error - _fetchCsrfToken - ' + err);
			}

		}
	}
	/*
	oOptions {object}				= Request object with url (endpoint) , method en possible headers
	sAuthToken {string} 			= authToken 
	sDestinationName {string}		= Name of the destination
	*/

const requestSCP = async(oOptions, sAuthToken, sDestinationName) => {
	try {
		/*
		Step 1 GET Destination token to access the destination instance. (JWT2)
		Step 2 GET Destination configuration object by sending JWT2.
		Step 3 GET connectivity token to access the connectivity instance.  (JWT3)
		Step 4 GET CSRF token  {conditional}
		Step 5 Execute Request to the connectivity instance with JWT3 and the Authorization header. (JWT1)
		Step 6. SAP Cloud Platform Connectivity forwards request to the Cloud Connector
		and sends the request to the on-premise system.
		Todo  CACHING toevoegen op JWT en CSRF token
		*/

		/*Step 1  GET Destination token to access the destination instance. (JWT2) */
		const sDestinationToken = await _private._getDestinationToken();

		/*Step 2  GET Destination configuration object by sending JWT2.*/
		const oDestination = await _private._getDestination(sDestinationName, sDestinationToken);

		/*Step 3 GET connectivity token to access the connectivity instance.  (JWT3)*/
		const sConnectivityToken = await _private._getConnectivityToken();

		/*Step 4 Execute Request to the connectivity instance with JWT3 and the Authorization header. (JWT1)
		Indien POST / PUT / DELETE dan csrf token ophalen */
		if (["POST", "PUT", "DELETE"].indexOf(oOptions.method.toUpperCase()) > -1) {
			//REQUEST CSRF token 
			const oCsrfHeaders = await _private._fetchCsrfToken(oOptions, sAuthToken, sConnectivityToken, oDestination);
			//Concat CSRF token + Headers from request
			const oHeaders = Object.assign( oOptions.headers, oCsrfHeaders);
		/*	const oHeaders = {...oOptions.headers,
				...oCsrfHeaders
			} */
			oOptions.headers = oHeaders;
		}

		/*Step 5 Execute Request to the connectivity instance with JWT3 and the Authorization header. (JWT1) */
		const oResult = await _private._RequestSCP(oOptions, sAuthToken, sConnectivityToken, oDestination);

		return oResult;

	} catch (err) {
		throw new Error('Error - request - ' + err);
	}
}

module.exports = {
	requestSCP
}