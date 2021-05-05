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
			console.log(result);
			bcrypt.compare(req.body.password, result.password, (err, same) => {
				console.log("done");
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
			client.db("broker").collection("users").insertOne({"username":req.body.username, "password":hash, "wallet":{"eur":"0"}});
		});
		res.json({"status":"success"})
	});
});

function authenticateToken(req, res, next) {
	console.log(req.body);
	const token = req.body.token
	// const token = authHeader.split(' ')[1]

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

app.use("/buy/:id", authenticateToken);

app.post("/buy/:id", (req, res) => {
	console.log("Logged in!")
	client.db("broker").collection("stocks").findOne({"symbol":req.body.symbol}, (err, result) => {
		if(err) throw err
		result = JSON.parse(JSON.stringify(result))
		res.set("content-type", "application/json")
		console.log(result);
		// res.jsonp(result)
	});
	res.json({"status":"success"})
})

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
