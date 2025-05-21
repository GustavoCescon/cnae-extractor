const { Client } = require("pg");
const { v4: uuidv4 } = require("uuid");
const fs = require("node:fs");
const path = require("node:path");
require("dotenv").config();
// Conexão com o banco
const client = new Client({
	user: process.env.DB_USER,
	host: process.env.DB_HOST,
	database: process.env.DB_NAME,
	password: process.env.DB_PASS,
	port: Number.parseInt(process.env.DB_PORT, 10),
});

const caminho = path.join(__dirname, "cnaes.json");
const raw = fs.readFileSync(caminho, "utf-8");
const jsonInput = JSON.parse(raw);

// Mapeamento de grau de risco para id_ficha_opcao
const riscoMap = {
	"Baixo risco": {
		nivel: "Nível de Risco I",
		id: "72e7447c-76d8-449a-ba6d-dddc5746f51d",
	},
	"Médio risco": {
		nivel: "Nível de Risco II",
		id: "1dd5cce8-99e9-46e0-9ada-d7008d881c6c",
	},
	"Alto risco": {
		nivel: "Nível de Risco III",
		id: "221fc76c-7e68-42fc-b874-2046732538d0",
	},
};

function printAuditoria({ row, id_atividade, id_pergunta, novoId, risco }) {
	console.log("\n🔍 AUDITORIA");
	console.table(row);

	console.group("📘 Alterações");
	console.log(`🟡 ATUALIZADO: atividade_id = ${id_atividade}`);
	console.log(`🔴 DELETADO:   pergunta_id = ${id_pergunta}`);
	console.log(`🟢 INCLUÍDO:   pergunta_id = ${novoId}`);
	console.log(`              opcao_id = ${risco.id}`);
	console.log(`              texto_resposta = ${risco.nivel}`);
	console.groupEnd();
	console.log("⏱️  Timestamp:", new Date().toLocaleString());
	console.log("──────────────────────────────────────────\n");
}

async function atualizarLinha(id_atividade, client) {
	return await client.query(`update el_tributario.trb_atividade set id_bol_meio_ambiente = 'S'
		where id = '${id_atividade}'`);
}

async function deletarPergunta(id_pergunta, client) {
	return await client.query(
		`DELETE FROM el_acesso.gg_ficha_resposta gfr where gfr.id = '${id_pergunta}' `,
	);
}

async function inserirLinha(dados, client) {
	return await client.query(
		`
		insert into el_acesso.gg_ficha_resposta(id, id_ficha_resposta_pai, id_ficha_opcao, texto_resposta_discursiva, "version") 
		VALUES ($1, $2, $3, $4, 0)
	`,
		[
			dados.novoId,
			dados.id_ficha_resposta_pai,
			dados.risco.id,
			dados.risco.nivel,
		],
	);
}

async function gerarLog(logPath, logEntry) {
	if (fs.existsSync(logPath)) {
		// Lê o conteúdo existente e adiciona o novo log
		const existing = JSON.parse(await fs.promises.readFile(logPath, "utf-8"));
		existing.push(logEntry);
		await fs.promises.writeFile(logPath, JSON.stringify(existing, null, 2));
	} else {
		// Cria o arquivo com o primeiro log dentro de um array
		await fs.promises.writeFile(logPath, JSON.stringify([logEntry], null, 2));
	}
}

function montarLogEntrada(dados) {
	return {
		timestamp: new Date().toISOString(),
		codigo: dados.row.codigo,
		usuario: {
			id: "",
			nome: "",
		},
		acao: "atualizacao de risco",
		alteracoes: {
			atualizado: {
				antigo: {
					atividade_id: dados.id_atividade,
					valor: dados.row.id_bol_meio_ambiente,
				},
				novo: { atividade_id: dados.id_atividade, valor: "S" },
			},
			deletado: {
				antigo: { pergunta_id: dados.id_pergunta, valor: dados.id_pergunta },
				novo: { pergunta_id: dados.id_pergunta, valor: dados.novoId },
			},
			incluido: {
				id: dados.novoId,
				pergunta_id: dados.novoId,
				opcao_id: dados.risco.id,
				texto_resposta: dados.risco.nivel,
			},
		},
	};
}
async function gerarLinhas(rows, client, cnaeObj) {
	for (const row of rows) {
		try {
			const id_pergunta = row.id_pergunta;
			const id_ficha_resposta_pai = row.id_ficha_resposta_pai;
			const id_atividade = row.atividade;

			// 1. Deletar a resposta atual
			const atualizou = await atualizarLinha(id_atividade, client);
			if (atualizou.rowCount === 0) {
				console.warn(
					`ATENÇÃO: Não foi possível atualizar a linha com id ${id_atividade}`,
				);
				continue;
			}

			const deletou = await deletarPergunta(id_pergunta, client);
			if (deletou.rowCount === 0) {
				console.warn(
					`ATENÇÃO: Não foi possível deletar a linha com id ${id_pergunta}`,
				);
				continue;
			}

			// 2. Inserir nova resposta
			const risco = riscoMap[cnaeObj.grauRisco];
			if (!risco) {
				console.warn(`ATENÇÃO: risco_desconhecido: ${cnaeObj.grauRisco}`);
				continue;
			}

			const novoId = uuidv4();
			const dados = {
				id_ficha_resposta_pai,
				novoId,
				risco,
			};
			const inseriu = await inserirLinha(dados, client);
			if (inseriu.rowCount === 0) {
				console.warn(
					`ATENÇÃO: Não foi possível inserir a linha com id ${novoId}`,
				);
				continue;
			}

			printAuditoria({ row, id_atividade, id_pergunta, novoId, risco });

			const conteudoLogEntrada = {
				row,
				id_atividade,
				id_pergunta,
				novoId,
				risco,
			};
			const logEntry = montarLogEntrada(conteudoLogEntrada);
			const logPath = path.join(__dirname, "auditoria.json");
			await gerarLog(logPath, logEntry);
		} catch (err) {
			console.error("Erro ao processar linha:", err);
			throw err; // Repassa o erro para o bloco que faz o rollback
		}
	}
}
async function main() {
	try {
		process.stdout.write("\x1Bc");
		await client.connect();
		await client.query("BEGIN");

		for (const item of jsonInput) {
			for (const cnaeObj of item.cnaes) {
				const cnaeOriginal = cnaeObj.cnae.replace(/\D/g, ""); // só números, mantém zeros
				const cnaeLimpo = cnaeOriginal.replace(/^0+/, ""); // remove zeros à esquerda

				// Consulta para pegar os dados atuais
				const selectQuery = `
          SELECT DISTINCT 
            ta.id as atividade,
            ta.codigo, 
            ta.id_bol_meio_ambiente,
            gfr.id_ficha_resposta_pai, 
            gfr.id as id_pergunta,
            gfr.id_ficha_opcao, 
            gfr.texto_resposta_discursiva, 
            gf.nome_ficha, 
            gfg.nome_ficha_grupo, 
            gfg.id as id_ficha_grupo
          FROM el_tributario.trb_atividade ta 
          INNER JOIN el_tributario.trb_atividade_item tai ON ta.id = tai.id_atividade 
          INNER JOIN el_tributario.trb_atividade_valor tav ON tai.id = tav.id_atividade_item 
          INNER JOIN el_acesso.gg_ficha_resposta_pai gfrp ON ta.id_ficha_resposta_pai = gfrp.id 
          INNER JOIN el_acesso.gg_ficha gf ON gf.id = gfrp.id_ficha 
          INNER JOIN el_acesso.gg_ficha_grupo gfg ON gf.id = gfg.id_ficha 
          INNER JOIN el_acesso.gg_ficha_pergunta gfp ON gfg.id = gfp.id_ficha_grupo 
          INNER JOIN el_acesso.gg_ficha_opcao gfo ON gfo.id_ficha_pergunta = gfp.id AND gfo.data_vigencia_final IS NULL
          INNER JOIN el_acesso.gg_ficha_resposta gfr ON gfr.id_ficha_opcao = gfo.id AND gfr.id_ficha_resposta_pai = gfrp.id
          WHERE ta.data_vigencia_final IS NULL 
            AND ta.codigo = '${cnaeLimpo}'
            AND gfg.id = '5d424293-357d-4c82-90e0-52e114b975e3'
            AND gfr.texto_resposta_discursiva IS NOT NULL
            AND TRIM(gfr.texto_resposta_discursiva) <> ''
            AND TRIM(gfr.texto_resposta_discursiva) LIKE 'Nível%'
        `;

				const { rows } = await client.query(selectQuery);
				console.log(rows);
				if (rows && rows.length > 0) {
					await gerarLinhas(rows, client, cnaeObj);
				}

				const selectQueryOriginal = `
          SELECT DISTINCT 
            ta.id as atividade,
            ta.codigo, 
            ta.id_bol_meio_ambiente,
            gfr.id_ficha_resposta_pai, 
            gfr.id as id_pergunta,
            gfr.id_ficha_opcao, 
            gfr.texto_resposta_discursiva, 
            gf.nome_ficha, 
            gfg.nome_ficha_grupo, 
            gfg.id as id_ficha_grupo
          FROM el_tributario.trb_atividade ta 
          INNER JOIN el_tributario.trb_atividade_item tai ON ta.id = tai.id_atividade 
          INNER JOIN el_tributario.trb_atividade_valor tav ON tai.id = tav.id_atividade_item 
          INNER JOIN el_acesso.gg_ficha_resposta_pai gfrp ON ta.id_ficha_resposta_pai = gfrp.id 
          INNER JOIN el_acesso.gg_ficha gf ON gf.id = gfrp.id_ficha 
          INNER JOIN el_acesso.gg_ficha_grupo gfg ON gf.id = gfg.id_ficha 
          INNER JOIN el_acesso.gg_ficha_pergunta gfp ON gfg.id = gfp.id_ficha_grupo 
          INNER JOIN el_acesso.gg_ficha_opcao gfo ON gfo.id_ficha_pergunta = gfp.id AND gfo.data_vigencia_final IS NULL
          INNER JOIN el_acesso.gg_ficha_resposta gfr ON gfr.id_ficha_opcao = gfo.id AND gfr.id_ficha_resposta_pai = gfrp.id
          WHERE ta.data_vigencia_final IS NULL 
            AND ta.codigo = '${cnaeOriginal}'
            AND gfg.id = '5d424293-357d-4c82-90e0-52e114b975e3'
            AND gfr.texto_resposta_discursiva IS NOT NULL
            AND TRIM(gfr.texto_resposta_discursiva) <> ''
            AND TRIM(gfr.texto_resposta_discursiva) LIKE 'Nível%'
        `;
				const { rows: rowsOriginal } = await client.query(selectQueryOriginal);
				console.log(rowsOriginal);
				if (rowsOriginal && rowsOriginal.length > 0) {
					await gerarLinhas(rowsOriginal, client, cnaeObj);
				}
			}
		}
		await client.query("COMMIT");
	} catch (err) {
		console.error("Erro:", err);
		await client.query("ROLLBACK");
	} finally {
		await client.end();
	}
}

main();
