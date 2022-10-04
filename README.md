# XTOX Backend

Navigation: [Website][1] | **Backend repository** | [Frontend repository][2]

  [1]: https://xtox.vercel.app
  [2]: https://github.com/singiamtel/xtox-front

Default port is 8080

# API Structure

## Authorization

POST /login -> Login with username and password, get a JWT for the other endpoints
POST /register -> Create a new account

## Free endpoints

GET / -> Test endpoint
GET /stock -> All available stocks in database
GET /stock/symbol -> Single stock (i.e. /stock/aapl)

## Protected endpoints

POST /buy/:id -> Buy a stock (if you have enough money)
POST /sell/:id -> Sell a stock
GET /wallet -> See your current money and stocks owned

# Environment

```
PORT=8080
JWT_SECRET="YOUR_JWT_SECRET"
MONGODB_URI="YOUR_MONGODB_URI""
```
