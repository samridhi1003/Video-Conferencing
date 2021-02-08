// Importing all the packages
const express = require('express');
const bodyParser = require('body-parser');
const request = require('request');
const cookieParser = require('cookie-parser')
const sha1 = require('sha-1')
const parser = require('xml2json');
const randomstring = require("randomstring");
const urlEncode = require('url-encode-decode')

const app = express();
app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static('public'));

//Options for converting XML to JSON response
var options = {
    object: true,
    reversible: false,
    coerce: false,
    sanitize: true,
    trim: true,
    arrayNotation: false,
    alternateTextNode: false
};

// LV SSO URL
const apiUrl = 'http://ssonew.lokavidya.com/api/login';
//BigBlueButton secret key and url
const bbb = {secret: 'ymKdItc9mPClJ3E5uTme5XHeXRB6Xo4GvGE6ykcRg',
			 url: 'http://vc2.lokavidya.com/bigbluebutton/api/'}
//For storing user session
var serverSessionToken = [];

//Checking if user is logged in or not
function validateUser(req, res, next){
	if (serverSessionToken.indexOf(req.cookies.session_token) >= 0){
		next();
	}
	else{
		res.redirect('/');
	}
}

//Home Route
app.get('/', (req, res) =>{
	res.render('home');
})

//Login Route
app.get('/login', (req, res) =>{
	// Redirecting to lv sso
	res.redirect('http://ssonew.lokavidya.com/sessions/verify?redirect_url=http://meet.lokavidya.com/auth')
})

//Auth Route to create a local session and fetch username and storing in cookie
app.get('/auth', (req, res)=>{
	res.cookie('session_token', sha1(req.query.token));
	serverSessionToken.push(sha1(req.query.token));;
	request('http://ssonew.lokavidya.com/api/find_by_token?token=' + req.query.token, function(error, response, body){
		body = JSON.parse(body);
		if(body.status == 200){
			res.cookie('name', body.name);
			res.redirect('/meet')
		}
		else {
			res.redirect('/')
		}
		
	})
})

//Home route after logging in
app.get('/meet', validateUser, (req, res) =>{
	res.render('meet', {name:req.cookies.name});
})

//Vc1 route to start meeting
app.get('/vc1', validateUser, (req, res) =>{
	var vc1url = 'http://vc1.lokavidya.com/' + randomstring.generate(7) + '#userInfo.displayName="' + urlEncode.encode(req.cookies.name) + '"';
	res.redirect(vc1url);
})

//Vc2 route
app.get('/vc2', validateUser, (req, res) =>{
	res.render('vc2', {name: req.cookies.name});
})

//Vc2 post route where user meeting is created
app.post('/vc2/join', validateUser, (req, res)=>{
	var meetId = randomstring.generate(7);
	console.log(urlEncode.encode(req.body.meetingName))
	var create = 'name='+ urlEncode.encode(req.body.meetingName)+ '&meetingID=' + meetId + '&attendeePW=111222&moderatorPW=333444&record=true&logoutURL=http://meet.lokavidya.com/meet';
	var queryCreate = 'create' + create + bbb.secret;
	var apiReqCreate = bbb.url + 'create?' + create + '&checksum=' + sha1(queryCreate);
	request.get(apiReqCreate, function(error, response, body){
		console.log(parser.toJson(body, options))
	})
	var joinMod = 'fullName=' + urlEncode.encode(req.cookies.name) + '&meetingID=' + meetId + '&password=333444';
	var queryJoinM = 'join' + joinMod + bbb.secret;
	var joinAsMod = bbb.url + 'join?' + joinMod + '&checksum=' + sha1(queryJoinM);
	res.render('joinVc2', {joinAsMod: joinAsMod, meetingId: meetId, name: req.cookies.name});
})

//Vc2 Join meeting get route, after entering User name from shareable link
app.get('/vc2/joinMeeting/:id', (req, res)=>{
	if(!(req.cookies.name == null)){
		var join = 'fullName=' + urlEncode.encode(req.cookies.name) + '&meetingID=' + req.params.id + '&password=111222';
		var queryJoin = 'join' + join + bbb.secret;
		var join = bbb.url + 'join?' + join + '&checksum=' + sha1(queryJoin);
		res.redirect(join)
	}
	else{
		res.cookie('vc2ID', req.params.id);
		res.render('nameVC')
	}
})

//Vc2 join meeting get route by logging into the sso
app.get('/vc2/join/sso', (req, res)=>{
	res.cookie('session_token', sha1(req.query.token));
	serverSessionToken.push(sha1(req.query.token));
	request('http://ssonew.lokavidya.com/api/find_by_token?token=' + req.query.token, function(error, response, body){
		body = JSON.parse(body);
		if(body.status == 200){
			res.cookie('name', body.name);
			var join = 'fullName=' + urlEncode.encode(body.name) + '&meetingID=' + req.cookies.vc2ID + '&password=111222';
			var queryJoin = 'join' + join + bbb.secret;
			var join = bbb.url + 'join?' + join + '&checksum=' + sha1(queryJoin);
			res.clearCookie('vc2ID');
			res.redirect(join)
		}
		else {
			res.redirect('/');
		}
	})
})



//Vc2 post route where the user is redirected to bigbluebutton after entering their name
app.post('/vc2/enterName', (req, res)=>{
		var join = 'fullName=' + urlEncode.encode(req.body.VCName) + '&meetingID=' + req.cookies.vc2ID + '&password=111222';
		var queryJoin = 'join' + join + bbb.secret;
		var join = bbb.url + 'join?' + join + '&checksum=' + sha1(queryJoin);
		res.redirect(join)

})

//Vc2 list of ongoing meetings happening on the server
app.get('/vc2/viewMeetings', validateUser, (req, res)=>{
	var viewMeet = bbb.url + '/getMeetings?checksum=' + sha1('getMeetings' + bbb.secret);
	var names = [];
	var meetingID = []
	var joinlink = [];
	request.get(viewMeet, (error, response, body)=>{
		var output = parser.toJson(body, options);
		var meetings = output.response.meetings.meeting;
		console.log(output);
		console.log(meetings);
		if(output.response.messageKey == 'noMeetings'){
			res.render('viewMeetings', {names: names, meetingID: meetingID, joinlink: joinlink, name: req.cookies.name})
		}
		else{
			try{
				meetings.forEach(function(meet){
					names.push(meet.meetingName);
					meetingID.push(meet.meetingID);
				})
				meetingID.forEach(function(id){
					var join = 'fullName=' + urlEncode.encode(req.cookies.name) + '&meetingID=' + id + '&password=333444';
					var queryJoin = 'join' + join + bbb.secret;
					var join = bbb.url + 'join?' + join + '&checksum=' + sha1(queryJoin);
					joinlink.push(join)
				})
				res.render('viewMeetings', {names: names, meetingID: meetingID, joinlink: joinlink, name: req.cookies.name})
			}
			catch{
				names.push(meetings.meetingName);
				meetingID.push(meetings.meetingID);
				var join = 'fullName=' + urlEncode.encode(req.cookies.name) + '&meetingID=' + meetingID[0] + '&password=333444';
				var queryJoin = 'join' + join + bbb.secret;
				var join = bbb.url + 'join?' + join + '&checksum=' + sha1(queryJoin);
				joinlink.push(join)
				res.render('viewMeetings', {names: names, meetingID: meetingID, joinlink: joinlink, name: req.cookies.name})	
			}
		}
	})
	
})

//Logout route 
app.get('/logout', (req, res) =>{
	res.clearCookie('session_token');
	res.clearCookie('name');
	res.redirect('/');
})

//Starting Server on port 8080
app.listen(8080, () =>{
	console.log('Server Running on port 8080');
})