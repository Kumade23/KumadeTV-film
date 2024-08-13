const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'))); // Serve file statici dalla cartella 'public'

const PORT = 3000;
const jsonFilePath = 'movies.json';

let moviesData = { "name": "🎬 FILM 🎬", "author": "@kumade23", "image": "https://telegra.ph/file/8bdf748bceb1a0d6389a3", "groups": [] };

// Carica i dati esistenti nel JSON, se presente
if (fs.existsSync(jsonFilePath)) {
    moviesData = JSON.parse(fs.readFileSync(jsonFilePath));
}

// Servire la pagina principale (lista film)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'films.html'));
});

// Servire la pagina di scraping
app.get('/scrape', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'scrape.html'));
});

// Servire la pagina di lista film
app.get('/films', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'films.html'));
});

// Endpoint per ottenere la lista JSON in formato raw
app.get('/film', (req, res) => {
    res.json(moviesData);
});

// Endpoint per eliminare un film
app.post('/delete-film', (req, res) => {
    const { movieName, password} = req.body;

    // Verifica della password
    if (password !== '@kumade23') {
        return res.status(403).json({ error: 'Password non corretta' });
    }

    // Trova l'indice del film da eliminare
    const movieIndex = moviesData.groups.findIndex(movie => movie.name === movieName);

    if (movieIndex === -1) {
        return res.status(404).json({ error: 'Film non trovato' });
    }

    // Rimuovi il film dalla lista
    moviesData.groups.splice(movieIndex, 1);

    // Salva i dati aggiornati su disco
    fs.writeFileSync(jsonFilePath, JSON.stringify(moviesData, null, 2));

    res.json({ success: true, message: 'Film eliminato con successo' });
});


// Endpoint per restituire film ordinati e filtrati
app.get('/film/search', (req, res) => {
    const query = req.query.q ? req.query.q.toLowerCase() : '';
    
    // Filtrare e ordinare i film
    const filteredMovies = moviesData.groups
        .filter(movie => movie.name.toLowerCase().includes(query))
        .sort((a, b) => a.name.localeCompare(b.name));
    
    res.json(filteredMovies);
});

app.post('/scrape', async (req, res) => {
    try {
        const imdbUrl = req.body.imdbUrl;

        // Estrarre l'ID del film dal link IMDb
        const imdbId = imdbUrl.split('/title/')[1].split('/')[0];

        // Richiesta all'API TMDb per ottenere il titolo in italiano e l'immagine del film
        const tmdbApiKey = '3a0a2828ee87871788df6cff0138a5ee';  // Sostituisci con la tua chiave API TMDb
        const tmdbApiUrl = `https://api.themoviedb.org/3/find/${imdbId}?api_key=${tmdbApiKey}&language=it-IT&external_source=imdb_id`;
        const tmdbResponse = await axios.get(tmdbApiUrl);

        if (tmdbResponse.data.movie_results.length === 0) {
            return res.status(404).json({ error: "Film non trovato su TMDb" });
        }

        const movieData = tmdbResponse.data.movie_results[0];
        const movieTitle = movieData.title;
        const movieImage = `https://image.tmdb.org/t/p/w500${movieData.poster_path}`;

        // Richiesta a mostraguarda.stream per ottenere i link video
        const mostraguardaUrl = `https://mostraguarda.stream/movie/${imdbId}`;
        const mostraguardaResponse = await axios.get(mostraguardaUrl);

        // Verifica se la risposta contiene "not found"
        if (mostraguardaResponse.data.includes('not found')) {
            return res.status(404).json({ error: "Film non disponibile" });
        }

        // Controllo se il film è già presente
        const isMoviePresent = moviesData.groups.some(movie => movie.name.localeCompare(movieTitle, undefined, { sensitivity: 'base' }) === 0);

        if (isMoviePresent) {
            return res.status(409).json({ error: "Film già disponibile" });
        }

        const $ = cheerio.load(mostraguardaResponse.data);

        // Estrarre i link e i nomi
        const stations = [];
        $('ul._player-mirrors li').each((i, elem) => {
            const name = $(elem).text().trim();
            const url = $(elem).attr('data-link');
            if (url) {
                stations.push({
                    "name": name,
                    "image": "https://png.pngtree.com/png-vector/20230124/ourmid/pngtree-arrow-icon-3d-play-png-image_6565151.png",
                    "url": url.startsWith('http') ? url : `https:${url}`,
                    "isHost": true
                });
            }
        });

        // Creare il nuovo gruppo per il film
        const newGroup = {
            "name": movieTitle,
            "image": movieImage,
            "info": "",
            "stations": stations
        };

        // Aggiungere il nuovo gruppo ai dati esistenti
        moviesData.groups.push(newGroup);

        // Salvare i dati aggiornati su disco
        fs.writeFileSync(jsonFilePath, JSON.stringify(moviesData, null, 2));

        res.json(moviesData);
    } catch (error) {
        console.error('Errore durante lo scraping:', error);
        res.status(500).json({ error: "Errore durante lo scraping" });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
