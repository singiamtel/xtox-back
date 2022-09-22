# XTOX Backend

Navigation: [Website][1] | **Backend repository** | [Frontend repository][2]

  [1]: https://xtox.vercel.app
  [2]: https://github.com/singiamtel/xtox-front

Default port is 8080

# API Structure

/stock -> All available stocks in database
/stock/symbol -> Single stock (i.e. /stock/aapl)

# Environment

```
PORT=8080
JWT_SECRET="YOUR_JWT_SECRET"
MONGODB_URI="YOUR_MONGODB_URI""
```
