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

app.use("/buy/:id", authenticateToken)

app.post("/buy/:id", (req, res) => {
	console.log("Logged in!")
	const add = {}
	var oldAmount = 0
	symbol = req.params.id
	client.db("broker").collection("wallets").findOne({username:req.user.username, }, (err, result) => {
		if(err) throw err
		console.log(result);
		for(key in result){
			if(key === symbol){
				oldAmount = parseFloat(result[key]) + 1
				oldAmount = oldAmount.toString()
				// console.log("old" + oldAmount);
			}
		}

		add[symbol] = oldAmount
		console.log(oldAmount);
		console.log("add::::");
		console.log(add);
		client.db("broker").collection("wallets").updateOne({username:req.user.username}, {$set: add}, (err, secResult) => {
			console.log(req.user?.username);
			// console.log(secResult);
			// If stock exists
			// if(result){
			// client.db("broker").collection("wallets").findOne({username:req.user.username}, (err, secResult) => {
			// 	// If wallet exists
			// 	if(secResult){
			// 		console.log(secResult.eur);
			// 		if(secResult.eur > result.hDailies[0].close){
			// 			const finalSym = result.symbol
			// 			console.log("result");
			// 			console.log(result);
			// 			console.log("Secresult");
			// 			console.log(secResult);
			// 				// client.db("broker").collection("wallets").updateOne({"username":req.user.username}, {$set:{eur : secResult.eur - result.hDailies[0].close, $addToSet : {finalSym: "1" }}})
			// // client.db("broker").collection("wallets").updateOne({"username":req.user.username}, {$set:{eur : secResult.eur - result.hDailies[0].close, $addToSet : {finalSym: "1" }}})
			// 		}
			// 		else console.log("NO RESULT");
			// 	}
			//
			// }
			// else{
			return res.json({
				"status":"error",
				"message":"Stock not found"
			})
			// }
			// res.jsonp(result)
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
