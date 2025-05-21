const fs = require("node:fs");
const pdf = require("pdf-parse");

list_block = [
	"3100-3/10",
	"0380-0/30",
	"0031-0/03",
	"1003-4/00",
	"0054-0/05",
	"2004-1/00",
	"3100-3/10",
	"0380-0/30",
	"0031-0/03",
	"1003-4/00",
	"0054-0/05",
	"2004-1/00",
];
function aplicarMascaraCNAE(cnae) {
	if (!/^\d{7}$/.test(cnae)) return cnae;
	const cnaeResult = `${cnae.slice(0, 4)}-${cnae[4]}/${cnae.slice(5, 7)}`;
	if (!list_block.includes(cnaeResult)) {
		return cnaeResult;
	}
}

async function extrairAtividadesDoPDF1(buffer) {
	const texto = (await pdf(buffer)).text;
	const linhas = texto
		.split("\n")
		.map((l) => l.trim())
		.filter(Boolean);
	const consemaRegex = /(?<!\d)(\d{1,2}\.\d{2})(?!\d)/gm;
	//const cnaeRegex = /(?<!\d)\d{7}(?!\d)/g;
	const cnaeRegex = /\d{7}/g;
	let cnaeMatch;
	let consemaMatch;

	const resultados = [];
	let entradaAtual = null;

	for (const linha of linhas) {
		consemaMatch = linha.match(consemaRegex);
		if (consemaMatch) {
			if (entradaAtual) resultados.push(entradaAtual);
			entradaAtual = {
				codigo: consemaMatch[0],
				atividade: "",
				cnaes: [],
			};
			continue;
		}

		cnaeMatch = linha.match(cnaeRegex);
		if (cnaeMatch) {
			cnaeMatch
				.filter((n) => n.length === 7 || n.length === 13) // só aceita 7 ou 13 dígitos
				.filter((n) => {
					// Ignora se está dentro de trecho com palavras como "identificador", "hash", ou URLs
					const contexto = texto
						.slice(texto.indexOf(n) - 50, texto.indexOf(n) + 50)
						.toLowerCase();
					return (
						!contexto.includes("identificador") &&
						!contexto.includes("autenticidade") &&
						!contexto.includes("https")
					);
				});
		}

		if (cnaeMatch && entradaAtual) {
			entradaAtual.cnaes.push(...cnaeMatch.map(aplicarMascaraCNAE));
		} else if (entradaAtual) {
			entradaAtual.atividade += (entradaAtual.atividade ? " " : "") + linha;
		}
	}
	if (entradaAtual) resultados.push(entradaAtual);
	return resultados;
}

// Extrai riscos com base no padrão esperado
async function extrairRiscosDoPDF2(buffer) {
	const texto = (await pdf(buffer)).text;

	const linhas = texto
		.split("\n")
		.map((l) => l.trim())
		.filter(Boolean);

	const linhaCompletaRegex = /^(\d{4}[.-]\d(?:\/\d{2})?)(.*)$/;

	const riscosPossiveis = ["baixorisco", "médiorisco", "altorisco"];

	function detectarRiscoNoTexto(textoString) {
		const texto = textoString.toLowerCase();
		for (const risco of riscosPossiveis) {
			if (texto.includes(risco)) {
				return risco
					.replace("baixo", "Baixo ")
					.replace("médio", "Médio ")
					.replace("alto", "Alto ")
					.replace("risco", "risco")
					.trim();
			}
		}
		return "(sem risco)";
	}

	const resultados = [];
	let entradaAtual = null;

	for (const linha of linhas) {
		const matchLinha = linha.match(linhaCompletaRegex);

		if (matchLinha) {
			if (entradaAtual) resultados.push(entradaAtual);

			const codigo = matchLinha[1];
			let resto = matchLinha[2];

			const riscoEncontrado = detectarRiscoNoTexto(resto);

			if (riscoEncontrado !== "(sem risco)") {
				// Remove o risco da descrição para limpar
				const regexRisco = new RegExp(
					riscoEncontrado.replace(" ", "").toLowerCase(),
					"i",
				);
				resto = resto.replace(regexRisco, "");
			}

			entradaAtual = {
				cnae: codigo,
				atividade: resto.trim() || "(sem texto)",
				grauRisco: riscoEncontrado,
			};
			continue;
		}

		// Verifica se a linha inteira tem risco mesmo grudado
		const linhaLower = linha.toLowerCase().replace(/\s+/g, "");

		const riscoNaLinha = detectarRiscoNoTexto(linhaLower);

		if (entradaAtual && riscoNaLinha !== "(sem risco)") {
			entradaAtual.grauRisco = riscoNaLinha;
			continue;
		}

		// Se for texto complementar, junta à descrição
		if (entradaAtual) {
			entradaAtual.atividade += (entradaAtual.atividade ? " " : "") + linha;
		}
	}

	if (entradaAtual) resultados.push(entradaAtual);

	return resultados;
}

async function principal() {
	process.stdout.write("\x1Bc"); // limpa tudo, inclusive scrollback

	const pdf1 = fs.readFileSync("meio-ambiente.pdf");
	const pdf2 = fs.readFileSync("decreto.pdf");

	const atividades = await extrairAtividadesDoPDF1(pdf1);
	const riscos = await extrairRiscosDoPDF2(pdf2);

	const mapaDeRisco = Object.fromEntries(
		riscos.map((r) => [r.cnae, r.grauRisco]),
	);

	const atividadesComRisco = atividades.map((a) => ({
		...a,
		cnaes: (a?.cnaes || [])
			.filter((cnae) => cnae !== undefined && cnae !== null) // filtra undefined e null
			.map((cnae) => ({
				cnae,
				grauRisco: mapaDeRisco[cnae] || "Desconhecido",
			})),
	}));

	// Remove apenas as entradas com cnaes vazias se já existir uma com o mesmo código e cnaes preenchidos
	const mapaFinal = new Map();

	for (const item of atividadesComRisco) {
		const existente = mapaFinal.get(item.codigo);

		if (!existente) {
			mapaFinal.set(item.codigo, item);
		} else {
			const existenteTemCnaes = existente.cnaes?.length > 0;
			const atualTemCnaes = item.cnaes?.length > 0;

			if (!existenteTemCnaes && atualTemCnaes) {
				mapaFinal.set(item.codigo, item); // substitui o antigo pelo novo com cnaes
			}
			// se já tem com cnaes, ignora os vazios
		}
	}

	const atividadesFiltradas = Array.from(mapaFinal.values());

	fs.writeFileSync("cnaes.json", JSON.stringify(atividadesFiltradas, null, 2));

	//fs.writeFileSync("cnaes.json", atividadesComRisco);
	//console.dir(atividadesComRisco, { depth: null });
	//console.log(JSON.stringify(atividadesComRisco, null, 2));
}

principal();
