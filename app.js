/**
 *
 * @author Laurine AUJEAU
 * @date à rendre pour le 27/01/2023
 * @description Service qui coordonne la réservation des ressources
 * @commentaire Tout le back se trouve dans le fichier app.js car je n'ai pas réussi à scinder les fonctionnalités :
 * J'ai tenté de créé un dossier routes contenant les fichiers
 *      - home.js : comprend les routes /home, /nextMonth, /previousMonth
 *      - index.js : comprend les routes /
 *      - login.js : comprend les routes /login, /logout
 *      - reservations.js : comprend les routes /newReservation
 *      - ressources.js : comprend les routes /newRessource
 *      - utilisateurs.js : comprend les routes /findUser, previousMonthInUserPage, /nextMonthInUserPage
 *      - utils.js : comprend toutes les fonctions utilitaires
 * Chacun de ces fichiers contient les définitions :
 *      const express = require('express');
 *      const router = express.Router();
 * ainsi que l'exportation : module.exports = router;
 * Dans app.js chaque route est définie de cette manière :
 *      const indexRouter = require(path.join(__dirname, "routes","index.js"));
 *      app.use("/", indexRouter);
 * Malheureusement, une erreur 404 était renvoyée à chaque fois indicquant que les redirections étaient impossible. Je n'ai pas réussi à résoudre mon problème.
 * Afin de pouvoir rendre un projet fonctionnel, j'ai réuni le back dans app.js.
 *
 */



// modules
require('dotenv').config();
const debug = require('debug')('http');
const morgan = require('morgan');
const express = require('express');
const path = require('path');
const session = require("express-session");
const app = express();
const port = process.env.PORT;
const {MongoClient} = require('mongodb');
const bcrypt = require("bcrypt");
const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri);
const db = client.db("ordonnanceur");
const utilisateursCollection = db.collection("utilisateurs");
const reservationsCollection = db.collection("reservations");
const ressourcesCollection = db.collection("ressources");
const mois = [
    {nom:'Janvier', nbJours:31},
    {nom:'Février', nbJours:28},
    {nom:'Mars', nbJours:31},
    {nom:'Avril', nbJours:30},
    {nom:'Mai', nbJours:31},
    {nom:'Juin', nbJours:30},
    {nom:'Juillet', nbJours:31},
    {nom:'Août', nbJours:31},
    {nom:'Septembre', nbJours:30},
    {nom:'Octobre', nbJours:31},
    {nom:'Novembre', nbJours:30},
    {nom:'Décembre', nbJours:31}
];
client.connect();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

// middlewares
app.use(morgan('dev'));
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: 'top secret',
    resave: true,
    saveUninitialized: true
}));

// middleware d'authentification

/**
 * Permet d'autoriser ou non l'accès à une page en tant qu'utilisateur lambda
 */
function auth(req, res, next) {
    if (req?.session?.user) {
        return next();
    }
    else {
        return res.sendStatus(401).send("Status 401 : Page non autorisée 1");
    }
}

/**
 * Permet d'autoriser ou non l'accès à une page en tant qu'utilisateur administrateur uniquement
 */
function authAdmin(req, res, next) {
    if (req?.session?.user?.role === "administrateur") {
        return next();
    }
    else {
        return res.sendStatus(401).send("Status 401 : Page non autorisée 2");
    }
}

/**
 * Un utilisateur essaye d'acceder a l'url du projet
 * S'il est déjà connecté, il est renvoyé vers /home
 * Sinon il est renvoyé vers /login
 */
app.get('/', function(req, res) {
    if(req?.session?.user){
        res.redirect("/home");
    }
    else{
        res.redirect("/login");
    }
});

/**
 * Si l'utilisateur est déjà connecté à une session, il est redirégé vers /home
 * sinon, il arrive sur la page /login
 * On envoie les nformations title et message au pug qui porte le nom login.pug
 */
app.get('/login', function(req, res) {
    if(req?.session?.user){
        res.redirect("/home");
        return;
    }
    let errorMessage ="";
    if(req.query.error){
        if(req.query.type === "connexionIncorrecte"){
            errorMessage = "L'utilisateur ou le mot de passe est incorrect"
        }
    }
    res.render("login", {title: "Connexion", message:errorMessage});
});

/**
 * l'utilisateur se trouve sur la page /login et appuie sur valider :
 * Si les identifiants sont remplis correctement, on les récupère et les vérifie
 * Si les identifiants sont vérifiés, une session est créée et on ajoute des informations à la session
 * Puis l'utilisateur est redirigé vers la page /home
 */
app.post('/login', function(req, res) {
    getUtilisateur(req.body.login, req.body.password).then( (utilisateur) =>{
        if(utilisateur){
            const date = new Date();
            req.session.numeroMois = date.getMonth();
            req.session.annee = date.getFullYear();
            req.session.numeroMoisUtilisateur = date.getMonth();
            req.session.anneeUtilisateur = date.getFullYear();
            req.session.user = { name: utilisateur.name, role : utilisateur.role};
            req.session.rechercheUtilisateur = '';
            req.session.rechercheUtilisateurName ='';
            req.session.history = [];
            res.redirect("/home");
        }else{
            res.redirect("/login?error=true&type=connexionIncorrecte");
        }
    });
});

/**
 * Fonction utilitaire permettant de vérifier une authentification
 * @param utilisateurName : Chaine de caractères tapée par l'utilisateur dans le champ Login
 * @param utilisateurPassword : Chaine de caractères tapée par l'utilisateur dans le champ Mot de passe
 * @returns une promise qui contient les informations de l'utilisateur si son identité est bien vérifiée
 */
async function getUtilisateur(utilisateurName, utilisateurPassword) {
    let utilisateur = await utilisateursCollection.findOne({name: utilisateurName});
    let retour = null;
    if(utilisateur){
        const result = bcrypt.compareSync(utilisateurPassword, utilisateur.mdp);
        if(result){
            retour = utilisateur;
        }
    }
    return retour;
}

/**
 * Fonction utilitaire permettant de renvoyer les informations de l'utilisateur recherché
 * @param nomUtilisateur :  Chaine de caractères tapée dans la barre de recherche
 * @returns une promise qui contient les informations de l'utilisateur si celui existe
 */
async function getRechercheUtilisateur(nomUtilisateur) {
    let utilisateur = await utilisateursCollection.findOne({name: nomUtilisateur});
    let retour = null;
    if(utilisateur){
        retour = utilisateur;
    }
    return retour;
}

/**
 * L'utilisateur est redirigé sur la page /home :
 * Si des informations sont présentes dans req.query.success puis req.query.type, on renvoie le message associé
 * des informations sont envoyées au pug nommé home.pug et celui est affiché
 */
app.get('/home', auth, function(req, res) {
    let alertMessage = "";
    let typeMessage ="";
    req.session.history.push({path: "/home", query: req.query});
    if(req.query.success){
        typeMessage = "success";
        if(req.query.type === "ressource"){
            alertMessage = "La ressource a bien été ajoutée";
        }else if(req.query.type === "reservation"){
            alertMessage = "La réservation a bien été ajoutée";
        }
    }else if(req.query.error){
        typeMessage = "error";
        if(req.query.type === "utilisateurIncorrecte"){
            alertMessage = "Cet utilisateur n'existe pas";
        }
    }
    getAllRessources().then( (allRessources) =>{
        getAllReservations(req.session.user.name).then((allReservations)=>{
            let nombreJours = mois[req.session.numeroMois].nbJours+((req.session.numeroMois===1&&req.session.annee%4===0)?1:0);//Permet de gérer l'année bissextile
            res.render("home", {
                title: "Page d'accueil",
                user : req.session.user,
                annee: req.session.annee,
                mois: mois[req.session.numeroMois].nom,
                nbMois: req.session.numeroMois+1,
                nbJours: nombreJours,
                ressources: allRessources.map(ressource => ressource.name),
                reservationsDuJour: (req?.query?.jour)?allReservations.filter(reservation => {
                    let dateDebut = dateToInt(reservation.dateDebut);
                    let dateFin = dateToInt(reservation.dateFin);
                    let numeroMois = req.session.numeroMois + 1;
                    let dateDebutJour = dateToInt(((parseInt(req.query.jour)<10)?"0"+req.query.jour:req.query.jour)+"/"+((numeroMois<10)?"0"+numeroMois:numeroMois)+"/"+req.session.annee+" 00:00");
                    let dateFinJour = dateToInt(((parseInt(req.query.jour)<10)?"0"+req.query.jour:req.query.jour)+"/"+((numeroMois<10)?"0"+numeroMois:numeroMois)+"/"+req.session.annee+" 23:59");
                    return !((dateFin < dateDebutJour) || (dateDebut > dateFinJour))
                }):null,
                reservations: allReservations.filter(reservation =>{
                    let dateDebut = dateToInt(reservation.dateDebut);
                    let dateFin = dateToInt(reservation.dateFin);
                    let numeroMois = req.session.numeroMois + 1;
                    let dateDebutMois = dateToInt("01/"+((numeroMois<10)?"0"+numeroMois:numeroMois)+"/"+req.session.annee+" 00:00");
                    let dateFinMois = dateToInt(nombreJours+"/"+((numeroMois<10)?"0"+numeroMois:numeroMois)+"/"+req.session.annee+" 23:59");
                    return !((dateFin < dateDebutMois) || (dateDebut > dateFinMois))
                }),
                jourClique:req?.query?.jour,
                ressourceClique:req?.query?.ressource,
                message: alertMessage,
                type:typeMessage
            });
        });
    });
});

/**
 * Lorsqu'on se trouve sur la page /home et que l'on clique sur le bouton du mois précédent du calendrier,
 * on change les informations liées à la date dans la session et on redirige vers /home (= donc app.get(/home) sera appelé)
 */
app.post('/previousMonth', auth, function(req, res) {
    if(req.session.numeroMois === 0){
        req.session.numeroMois = 11;
        req.session.annee --;
    }else{
        req.session.numeroMois --;
    }
    res.redirect('/home');
});

/**
 * Lorsqu'on se trouve sur la page /findUser et que l'on clique sur le bouton du mois précédent du calendrier,
 * on change les informations liées à la date dans la session et on redirige vers /findUser (= donc app.get(/findUser) sera appelé)
 */
app.post('/previousMonthInUserPage', auth, function(req, res) {
    if(req.session.numeroMoisUtilisateur === 0){
        req.session.numeroMoisUtilisateur = 11;
        req.session.anneeUtilisateur --;
    }else{
        req.session.numeroMoisUtilisateur --;
    }
    res.redirect('/findUser?rechercheUtilisateurName='+req.query.rechercheUtilisateurName);
});

/**
 * Lorsqu'on se trouve sur la page /home et que l'on clique sur le bouton du mois suivant du calendrier,
 * on change les informations liées à la date dans la session et on redirige vers /home (= donc app.get(/home) sera appelé)
 */
app.post('/nextMonth', auth, function(req, res) {
    if(req.session.numeroMois === 11){
        req.session.numeroMois = 0;
        req.session.annee ++;
    }else{
        req.session.numeroMois ++;
    }
    res.redirect('/home');
});

/**
 * Lorsqu'on se trouve sur la page /findUser et que l'on clique sur le bouton du mois suivant du calendrier,
 * on change les informations liées à la date dans la session et on redirige vers /findUser (= donc app.get(/findUser) sera appelé)
 */
app.post('/nextMonthInUserPage', auth, function(req, res) {
    if(req.session.numeroMoisUtilisateur === 11){
        req.session.numeroMoisUtilisateur = 0;
        req.session.anneeUtilisateur ++;
    }else{
        req.session.numeroMoisUtilisateur ++;
    }
    res.redirect('/findUser?rechercheUtilisateurName='+req.query.rechercheUtilisateurName);
});

/**
 * Permet la redirection vers la page /newReservation en cliquant sur le bouton Nouvelle Réservation présent sur la page /home
 */
app.get('/newReservation', auth, function(req, res) {
    let alertMessage ="";
    let typeMessage ="";
    req.session.history.push({path: "/newReservation", query: req.query});
    if(req.query.error){
        typeMessage = "error";
        if(req.query.type === "ressourceIndisponible"){
            alertMessage = "Cette ressource est indisponible à cette période";
        }else if(req.query.type === "finDebut"){
            alertMessage = "Dates de réservation incorrectes : La date de fin doit être supérieure à la date de début";
        } else if(req.query.type === "debutMaintenant"){
            alertMessage = "Dates de réservation incorrectes : La date de début doit être supérieure à la date actuelle";
        } else if(req.query.type === "datesIncorrectes"){
            alertMessage = "Dates de réservation incorrectes : Le format exigé est JJ/MM/AAAA HH:MM";
        }else if(req.query.type === "utilisateurIncorrecte"){
            alertMessage = "Cet utilisateur n'existe pas";
        }
    }
    getAllRessources().then( (allRessources) =>{
        res.render("newReservation", {
            title: "Nouvelle Réservation",
            user : req.session.user,
            ressources: allRessources.map(ressource => ressource.name),
            message: alertMessage,
            type: typeMessage
        });
    });
});

/**
 * On se trouve sur la page /newReservation et on appuie sur valider :
 * On veut récupérer les informations(nom+date) concernant la nouvelle réservation
 * Puis on le redirige vers la page /home avec les paramètres success=true et type=reservation
 *
 * Si on appuie sur annuler :
 * on le redirige vers la page /home et n'enregistre aucun information
 */
app.post('/newReservation', auth, function(req, res) {
    let promises = [];
    getReservation(req.body.nomRessource, req.body.debutReservation, req.body.finReservation).then( (reservation) =>{
        if(reservation === "fin<debut"){
            res.redirect("/newReservation?error=true&type=finDebut");
        }else if(reservation === "debut<maintenant"){
            res.redirect("/newReservation?error=true&type=debutMaintenant");
        }else if(reservation === "ressourceIndisponible"){
            res.redirect("/newReservation?error=true&type=ressourceIndisponible");
        }else if(reservation === "datesIncorrectes"){
            res.redirect("/newReservation?error=true&type=datesIncorrectes");
        }else{
            promises.push(
                reservationsCollection.insertOne({
                    utilisateur : req.session.user.name,
                    ressource: req.body.nomRessource,
                    dateDebut: req.body.debutReservation,
                    dateFin: req.body.finReservation
                })
            );
            Promise.all(promises);
            res.redirect("/home?success=true&type=reservation");
        }
    });
});

/**
 * Redirection sur la page /newRessource en cliquant sur le bouton Nouvelle ressource présent sur la page /home
 * On envoie les informations au pug newRessource
 */
app.get('/newRessource', authAdmin, function(req, res) {
    let alertMessage ="";
    let typeMessage ="";
    req.session.history.push({path: "/newRessource", query: req.query});
    if(req.query.error){
        typeMessage = "error";
        if(req.query.type === "ressourceExistante"){
            alertMessage = "Cette ressource existe déjà";
        }
        if(req.query.type === "utilisateurIncorrecte"){
            alertMessage = "Cet utilisateur n'existe pas";
        }
    }
    res.render("newRessource", {title: "Nouvelle Ressource", user:req.session.user, message:alertMessage, type: typeMessage});
});

/**
 * L'utilisateur se trouve sur la page /newRessource et on appuie sur valider :
 * On veut récupérer les informations concernant la nouvelle ressource
 * Puis l'utilisateur est redirigé vers la page /home avec les paramètres success=true et type=ressource
 *
 * Si on appuie sur annuler :
 * L'utilisateur est redirigé vers la page /home sans enregistrer aucune information
 */
app.post('/newRessource', authAdmin, function(req, res) {
    let promises = [];
    getRessource(req.body.nomRessource).then( (ressource) =>{
        if(ressource){
            res.redirect("/newRessource?error=true&type=ressourceExistante");
        }else{
            promises.push(
                ressourcesCollection.insertOne({
                    name : req.body.nomRessource,
                    architecture: req.body.architecture,
                    nbCoeurs: parseInt(req.body.nbCoeurs),
                    ram: parseInt(req.body.ram),
                    disponible: true
                })
            );
            Promise.all(promises);
            res.redirect("/home?success=true&type=ressource");
        }
    });
});

/**
 * Fonction utilitaire permettant de vérifier si une ressource est disponible pour une réservation aux dates entrées par l'utilisateur
 * @param nomRessource : Chaine de caractères tapée par l'utilisateur dans le champ Nom de la ressource
 * @param debutReservation : Chaine de caractères tapée par l'utilisateur dans le champ Début de la réservation
 * @param finReservation : Chaine de caractères tapée par l'utilisateur dans le champ Fin de la réservation
 * @returns une chaine de caractères en renvoyée indiquant l'état de la ressource demandée
 */
async function getReservation(nomRessource, debutReservation, finReservation) {
    let reservations = await reservationsCollection.find({ressource: nomRessource}).toArray();
    let retour = "";
    let ressourceEstDisponible = true;
    if(reservations.length > 0){
        if(dateToInt(debutReservation) && dateToInt(finReservation) && dateExistante(debutReservation) && dateExistante(finReservation)){
            const dateDebutReservationEnCours = dateToInt(debutReservation);
            const dateFinReservationEnCours = dateToInt(finReservation);
            for(let reservation of reservations){
                const dateDebut = dateToInt(reservation.dateDebut);
                const dateFin = dateToInt(reservation.dateFin);
                if(dateDebutReservationEnCours >= dateDebut && dateDebutReservationEnCours <= dateFin){
                    if(dateFinReservationEnCours >= dateDebut && dateFinReservationEnCours <= dateFin){
                        ressourceEstDisponible = false;
                    }
                }
            }
            if(ressourceEstDisponible){
                if(dateFinReservationEnCours <= dateDebutReservationEnCours){
                    //La date de fin de résevation est inférieur à la date de début
                    retour = "fin<debut";
                }else if (dateDebutReservationEnCours < Date.now()){
                    //La date de début de réservation est inférieur à la date actuelle
                    retour = "debut<maintenant";
                }else{
                    //Les dates de réservation sont valides
                    retour = "reservationOK";
                }
            }else{
                // La ressource est indisponible à cette période
                retour = "ressourceIndisponible";
            }
        }else{
            //La ou les dates renseignées sont incorrectes
            retour = "datesIncorrectes";
        }
    }else{
        // La ressource est disponible
        retour = "reservationOK";
    }
    return retour;
}

/**
 * Fonction utilitaire permettant de convertir une date de format JJ/MM/AAAA sous le format ISO
 * @param date : Chaine de caractère sour le format JJ/MM/AAAA
 * @returns format Date, peut-être traitée comme un INT si la conversion est possible, null sinon
 */
function dateToInt(date){
    try{
        let arraySplitJourHeure = date.split(" ");
        let arraySplitJour = arraySplitJourHeure[0].split("/");
        let arraySplitHeure = arraySplitJourHeure[1].split(":");
        let dateISO = arraySplitJour[2]+"-"+arraySplitJour[1]+"-"+arraySplitJour[0]+"T"+arraySplitHeure[0]+":"+arraySplitHeure[1]+":00";
        return Date.parse(dateISO);
    }catch (e) {
        console.log(e);
        return null;
    }
}

/**
 * Fonction utilitaire permettant de vérifier si une date ayant un bon format existe bien et éviter entrer des dates telles que 30 février
 * @param date: date à vérifier
 * @returns un booleen confirmant ou non l'existance de la date
 */
function dateExistante(date){
    let retour = false;
    let arraySplitJourHeure = date.split(" ");
    let arraySplitJour = arraySplitJourHeure[0].split("/");
    let annee = parseInt(arraySplitJour[2]);
    let numero_mois = parseInt(arraySplitJour[1]);
    let jour = parseInt(arraySplitJour[0]);
    if(jour <= mois[numero_mois-1].nbJours+((numero_mois===1&&annee%4===0)?1:0)){//La ternaire permet de gérer l'année bissextile
        retour = true;
    }
    return retour;
}

/**
 * Fonction utilitaire permettant de récupérer toutes les informations liées aux réservation d'un utilisateur donné
 * @param utilisateurConnecte : nom de l'utilisateur en question
 * @returns tableau de promises contenant les informations pour chaque réservation associée à l'utilisateur
 */
async function getAllReservations(utilisateurConnecte) {
    return await reservationsCollection.find({utilisateur: utilisateurConnecte}).toArray();
}

/**
 * Fonction utilitaire permettant de récupérer les informations liées à une ressource si celle-ci existe
 * @param nomRessource : nom de la ressource en question
 * @returns  promise contenant les informations de la ressource si celle-ci existe
 */
async function getRessource(nomRessource) {
    let ressource = await ressourcesCollection.findOne({name: nomRessource});
    let retour = null;
    if(ressource){
        retour = ressource;
    }
    return retour;
}

/**
 *  Fonction utilitaire permettant de récupérer toutes les ressources proposées dans ce projet
 * @returns tableau de promises contenant les informations pour chaque ressource
 */
async function getAllRessources() {
    return await ressourcesCollection.find().toArray();
}

/**
 * Redirection sur la page /findUser si l'utilisateur tapé dans la barre de recherche existe
 * On envoie les informations au pug findUser
 */
app.get('/findUser', auth, function(req, res) {
    let alertMessage = "";
    let typeMessage ="";
    req.session.history.push({path: "/findUser", query: req.query});
    if(req.query.error){
        typeMessage = "error";
        if(req.query.type === "utilisateurIncorrecte"){
            alertMessage = "Cet utilisateur n'existe pas";
        }
    }
    getAllRessources().then( (allRessources) =>{
        getAllReservations(req.query.rechercheUtilisateurName).then((allReservations)=>{
            let nombreJours = mois[req.session.numeroMoisUtilisateur].nbJours+((req.session.numeroMoisUtilisateur===1&&req.session.anneeUtilisateur%4===0)?1:0);//Permet de gérer l'année bissextile
            req.session.rechercheUtilisateurName = (req.query.rechercheUtilisateurName)?req.query.rechercheUtilisateurName:req.session.rechercheUtilisateurName;
            let jourClique = (req?.query?.jour)?req.query.jour:null;
            if(req.session.rechercheUtilisateurName !== req.session.history[req.session.history.length-2].query.rechercheUtilisateurName){
                const date = new Date();
                req.session.numeroMoisUtilisateur = date.getMonth();
                req.session.anneeUtilisateur = date.getFullYear();
            }
            res.render("findUser", {
                title: "Profil de "+ req.session.rechercheUtilisateurName,
                utilisateurName: req.session.rechercheUtilisateurName,
                user : req.session.user,
                annee: req.session.anneeUtilisateur,
                mois: mois[req.session.numeroMoisUtilisateur].nom,
                nbMois: req.session.numeroMoisUtilisateur+1,
                nbJours: nombreJours,
                ressources: allRessources.map(ressource => ressource.name),
                reservationsDuJour: (jourClique)?allReservations.filter(reservation => {
                    let dateDebut = dateToInt(reservation.dateDebut);
                    let dateFin = dateToInt(reservation.dateFin);
                    let numeroMois = req.session.numeroMoisUtilisateur + 1;
                    let dateDebutJour = dateToInt(((parseInt(jourClique)<10)?"0"+jourClique:jourClique)+"/"+((numeroMois<10)?"0"+numeroMois:numeroMois)+"/"+req.session.annee+" 00:00");
                    let dateFinJour = dateToInt(((parseInt(jourClique)<10)?"0"+jourClique:jourClique)+"/"+((numeroMois<10)?"0"+numeroMois:numeroMois)+"/"+req.session.annee+" 23:59");
                    return !((dateFin < dateDebutJour) || (dateDebut > dateFinJour))
                }):null,
                reservations: allReservations.filter(reservation =>{
                    let dateDebut = dateToInt(reservation.dateDebut);
                    let dateFin = dateToInt(reservation.dateFin);
                    let numeroMois = req.session.numeroMoisUtilisateur + 1;
                    let dateDebutMois = dateToInt("01/"+((numeroMois<10)?"0"+numeroMois:numeroMois)+"/"+req.session.anneeUtilisateur+" 00:00");
                    let dateFinMois = dateToInt(nombreJours+"/"+((numeroMois<10)?"0"+numeroMois:numeroMois)+"/"+req.session.anneeUtilisateur+" 23:59");
                    return !((dateFin < dateDebutMois) || (dateDebut > dateFinMois))
                }),
                jourClique:jourClique,
                ressourceClique:req?.query?.ressource,
                message: alertMessage,
                type:typeMessage
            });
        });
    });
});

/**
 *  L'utilisateur se trouve sur la page /findUser et appuie sur Retour à la page d'accueil :
 * Il est redirigé vers la page /home
 */
app.post('/findUser', auth, function(req, res) {
    getRechercheUtilisateur(req.body.rechercheUtilisateur).then( (utilisateur) =>{
        if(utilisateur){
            res.redirect("/findUser?rechercheUtilisateurName="+utilisateur.name);
        }else{
            let pagePrecedente = req.session.history[req.session.history.length-1];
            res.redirect(pagePrecedente.path+"?error=true&type=utilisateurIncorrecte"
            +((pagePrecedente.query?.rechercheUtilisateurName)?"&rechercheUtilisateurName="+pagePrecedente.query.rechercheUtilisateurName:"")
            );
        }
    });
});

/**
 * si l'utilisateur appuie sur le bouton deconnexion :
 * Il retourne à la page /login
 * la session est détruite
*/
app.post('/logout', function(req, res) {
    req.session.destroy();
    if(req.session){
        //Deconnexion impossible
    }else{
        //Deconnexion réussie
        res.redirect("/login");
    }

});

/**
 Si on recoit une requête à une adresse qu'on n'a
 pas configurée, on retourne une page vide avec un message : Status 404 : Page introuvable
*/
app.all("*", (req, res) => {
    res.status(404).send("Status 404 : Page introuvable");
});

/**
 * Démarrer le serveur sur le port 3000
 */
app.listen(port, () => {
    debug(`Listening on port ${port}`);
});
