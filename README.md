# scp-connector

Module om connectie te maken vanuit applicatie naar on premise systemen via de SAP Cloud Connector


![Alt text](./images/SAP-CP-Connectivity-CF-Flow.png?raw=true "SCP proces flow")

In general the following steps are taken during a call to an on premise system. These are also depicted in the proces flow figure.
1. User calls an application through the AppRouter, which provides a central point of entry to business applications.
2. The request is redirected to XSUAA and the user needs to login. Then a JWT1 (JSON Web Token) is created and sent to the AppRouter.
3. The AppRouter forwards the request to the relevant application URL which is defined as destination, it also passes the JWT1 token with credentials.

Then the following steps are relevant for the SCP connector module:
4a. The module requests a JWT2 to access the destination instance.
4b. The WebApp requests a JWT3 to access the connectivity instance.
5. The WebApp requests destination configuration by sending JWT2.
6. The WebApp sends request to the connectivity instance with JWT3 and the Authorization header.
7. SAP Cloud Platform Connectivity forwards request to the Cloud Connector.
8. Cloud Connector sends request to the on-premise system.