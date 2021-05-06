require("dotenv").config()
const bcrypt = require('bcrypt')
const express = require("express")
const slowDown = require("express-slow-down")
const helmet = require("helmet")
const cors = require("cors")
const morgan = require("morgan")
const {MongoClient} = require('mongodb');
const jwt = require('jsonwebtoken');

if(!process.env.MONGODB_URI){
	throw new Error("No MongoDB URI was set")
}
const client = new MongoClient(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })

client.connect()

const speedLimiter = slowDown({
	windowMs: 15 * 60 * 1000,
	delayAfter: 100,
	delayMs: 500
});

const app = express();
const port = process.env.PORT || 8080

const saltRounds = 10;

app.use(express.json())
app.use(helmet())
app.use(morgan("tiny"))
app.use(cors())
app.use(speedLimiter)

function generateToken(username) {
	return jwt.sign(username, process.env.JWT_SECRET, {expiresIn : 3600});
}

app.post('/login', (req, res) => {
	client.db("broker").collection("users").findOne({"username":req.body.username}, (err, result) =>{
		if(err) throw err;
		if(result){
			bcrypt.compare(req.body.password, result.password, (err, same) => {
				if(err) throw err;
				if(same){
					res.send({
						status: "success",
						token:generateToken({username : req.body.username} )
					});
				}
				else{
					res.send({
						status: "error",
						token: ''
					})

				}
			})
		}
		else{
			res.send({
				status: "error",
				token: ''
			})
		}
	})
});

app.post('/register', (req, res) => {
	client.db("broker").collection("users").findOne({"username":req.body.username}, (err, result) =>{
		if(result){
			res.json({"status":"error", "message":"Username already exists in database"})
			return
		}

		bcrypt.hash(req.body.password, saltRounds, function(err, hash) {
			client.db("broker").collection("users").insertOne({"username":req.body.username, "password":hash});
			client.db("broker").collection("wallets").insertOne({"username":req.body.username, "eur":"1000"});
		});
		res.json({"status":"success"})
	});
});

function authenticateToken(req, res, next) {
	const token = req.body.token
	if (token == null) return res.sendStatus(401)

	jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
		if (err){
			console.log(err);
			return res.sendStatus(403)
		}

		req.user = user

		next()
	})
}

const currency = ["eur"]

app.use("/buy/:id", authenticateToken)

app.post("/buy/:id", (req, res) => {
	console.log("Logged in!")
	console.log(req.body);
	console.log("ENDQUERY");
	const add = {}
	var oldAmount = 0
	symbol = req.params.id.toUpperCase()
	client.db("broker").collection("wallets").findOne({username:req.user.username }, (err, result) => {
		if(err) throw err
		console.log(result);
		for(key in result){
			if(key === symbol){
				oldAmount = parseFloat(result[key]) + parseFloat(req.body.amount)
				oldAmount = oldAmount.toString()
			}
			// if(currency.includes(key)){
            //
			// 	client.db("broker").collection("stocks").findOne({symbol:symbol }, (err, stockResult) => {
			// 	if(result[key] < stockResult.hDailies[0].close){
			// 		return res.json({
			// 			"status":"error",
			// 			"message":"Insufficient currency in wallet"
			// 		})
			// 	}
			// 	})
			// 		
			// }
		}
		add[symbol] = oldAmount
		console.log(oldAmount);
		console.log("add::::");
		console.log(add);
		client.db("broker").collection("wallets").updateOne({username:req.user.username}, {$set: add}, (err, secResult) => {
			console.log(req.user?.username);
			return res.json({
				"status":"error",
				"message":"Stock not found"
			})
		});
	})

})

app.use("/sell/:id", authenticateToken)

app.post("/sell/:id", (req, res) => {
	console.log("Logged in!")
	console.log(req.body);
	console.log("ENDQUERY");
	const add = {}
	var oldAmount = 0
	symbol = req.params.id.toUpperCase()
	client.db("broker").collection("wallets").findOne({username:req.user.username }, (err, result) => {
		if(err) throw err
		console.log(result);
		for(key in result){
			if(key === symbol){
				oldAmount = parseFloat(result[key]) - parseFloat(req.body.amount)
				oldAmount = oldAmount.toString()
			}
		}
		add[symbol] = oldAmount
		console.log(oldAmount);
		console.log("add::::");
		console.log(add);
		client.db("broker").collection("wallets").updateOne({username:req.user.username}, {$set: add}, (err, secResult) => {
			console.log(req.user?.username);
			return res.json({
				"status":"error",
				"message":"Stock not found"
			})
		});
	})

})

app.use("/wallet", authenticateToken)

app.post("/wallet", function(req, res){
	client.db("broker").collection("wallets").findOne({username:req.user.username}, (err, result) => {
		delete result.username
		delete result._id
		delete result.eur
		res.json(result)
	})
});

app.get("/", function(req, res){
	res.json({"status":"success"})
});

app.get("/stock", function(req, res){
	client.db("broker").collection("stocks").find({}).toArray( (err, result) =>{
		if(err) throw err;
		result = JSON.parse(JSON.stringify(result))
		res.set('content-type', 'application/json');
		res.jsonp(result)
	});
});

app.get("/stock/:symbol", function(req, res){
	let sym = req.params.symbol.toUpperCase()
	client.db("broker").collection("stocks").findOne({"symbol":sym}, (err, result) =>{
		if(err) throw err;
		result = JSON.parse(JSON.stringify(result))
		res.set('content-type', 'application/json');
		res.jsonp(result)
	});
});

app.use(function (req, res, next) {
	res.status(404).send("Not found")
})

app.listen(port, () => {
	console.log(`App running in port ${port}`)
})
