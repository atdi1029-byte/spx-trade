// Pokemon card effects. The same file lives in the crypto and SPX trade apps: animated
// sprites, type colors, the next Pokemon as a silhouette, confetti for the level-up reveal.
(function () {
    // Type of each Pokemon in Pokedex order (the second type when the first is Normal:
    // Pidgey is Flying, Jigglypuff is Fairy)
    var TYPES = (
        'grass grass grass fire fire fire water water water bug bug bug bug bug bug ' +
        'flying flying flying normal normal flying flying poison poison electric electric ground ground poison poison ' +
        'poison poison poison poison fairy fairy fire fire fairy fairy poison poison grass grass grass ' +
        'bug bug bug bug ground ground normal normal water water fighting fighting fire fire water ' +
        'water water psychic psychic psychic fighting fighting fighting grass grass grass water water rock rock ' +
        'rock fire fire water water electric electric flying flying flying water water poison poison water ' +
        'water ghost ghost ghost rock psychic psychic water water electric electric grass grass ground ground ' +
        'fighting fighting normal poison poison ground ground normal grass normal water water water water water ' +
        'water psychic bug ice electric fire bug normal water water water normal normal water electric ' +
        'fire normal rock rock rock rock rock normal ice electric fire dragon dragon dragon psychic ' +
        'psychic'
    ).split(' ');
    var COLORS = {
        normal: '#A8A77A', fire: '#EE8130', water: '#6390F0', electric: '#F7D02C', grass: '#7AC74C',
        ice: '#96D9D6', fighting: '#C22E28', poison: '#A33EA1', ground: '#E2BF65', flying: '#A98FF3',
        psychic: '#F95587', bug: '#A6B91A', rock: '#B6A136', ghost: '#735797', dragon: '#6F35FC',
        dark: '#705746', steel: '#B7B7CE', fairy: '#D685AD'
    };
    var BASE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/';

    window.pokeStill = function (id) { return BASE + id + '.png'; };
    // Animated pixel sprites from Pokemon Black/White
    window.pokeAnim = function (id) { return BASE + 'versions/generation-v/black-white/animated/' + id + '.gif'; };
    // onerror="pokeFallback(this, id)": a GIF that won't load shows the still sprite
    window.pokeFallback = function (img, id) { img.onerror = null; img.src = window.pokeStill(id); };
    window.pokeType = function (id) { return TYPES[id - 1] || 'normal'; };

    // --poke / --poke-rgb / --poke-light on el: the type color, as hex, "r,g,b" and a lighter
    // shade for text on dark backgrounds
    window.pokeColors = function (el, id) {
        var hex = COLORS[window.pokeType(id)] || COLORS.normal;
        var n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
        var lift = function (c) { return Math.round(c + (255 - c) * 0.45); };
        el.style.setProperty('--poke', hex);
        el.style.setProperty('--poke-rgb', r + ',' + g + ',' + b);
        el.style.setProperty('--poke-light', 'rgb(' + lift(r) + ',' + lift(g) + ',' + lift(b) + ')');
    };

    window.pokeConfetti = function (container, count) {
        var colors = [getComputedStyle(container).getPropertyValue('--poke').trim() || '#fff', '#ffffff', '#ffe066', '#ff8a65'];
        for (var i = 0; i < (count || 60); i++) {
            var c = document.createElement('span');
            c.className = 'poke-confetti';
            c.style.left = (Math.random() * 100) + '%';
            c.style.background = colors[i % colors.length];
            c.style.animationDuration = (2.2 + Math.random() * 2) + 's';
            c.style.animationDelay = (Math.random() * 0.6) + 's';
            container.appendChild(c);
            setTimeout(function (el) { el.remove(); }.bind(null, c), 5500);
        }
    };
})();
