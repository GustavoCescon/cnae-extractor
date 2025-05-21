# 📄 CNAE PDF Importer

## 📌 Descrição

Projeto para extrair dados de CNAEs a partir de dois arquivos PDF, processar e inserir as informações em um banco de dados PostgreSQL. Automatiza a captura e armazenamento dos dados relevantes para consultas e análises posteriores.

---

## ⚙️ Funcionalidades

- 📥 Leitura de dados CNAE de PDFs
- 🧹 Processamento e limpeza dos dados extraídos
- 🗄️ Inserção dos dados em banco PostgreSQL
- 🔍 Consulta e validação dos registros inseridos

---

## 🛠️ Tecnologias

- `Node.js`
- `PostgreSQL`
- Bibliotecas[`pdf-parse`, `fs`, `pdf-uuid`, `pg`, `dotenv`, `path`]

---

## 📦 Pré-requisitos

- Node.js instalado (versão 16+ recomendada)
- PostgreSQL configurado e rodando
- Arquivos PDF contendo os dados CNAE
- Variáveis de ambiente configuradas (`.env`)

---

## 🚀 Configuração

1. Clone o repositório:

```bash
git clone https://github.com/GustavoCescon/cnae-extractor.git
cd cnae-extractor
```

2. Instale as dependências:
```bash
npm install
```

## 🚀 Uso

1. Execute para iniciar a leitura dos PDFs:
```bash
npm start:extracto
```
2. Execute para inserir os dados do PDFs no banco:

```bash
npm start:bd
```

## 🗂 Estrutura

```
cnae-pdf-importer/
├── .env.example           # Exemplo de variáveis de ambiente
├── .gitignore
├── package.json
└── .env                   #variaveis de ambiente
└── index.js               # Arquivo para extrair dados do pdf
└── executar.js            #Arquivo para inserir no banco
└── decreto.pdf            #PDF com os riscos do CNAE
└── meio-ambiente.pdf      #PDF com os CNAE
└── README.md
```

## 🔐 Variáveis de Ambiente

Para rodar esse projeto, você vai precisar adicionar as seguintes variáveis de ambiente no seu .env

`DB_HOST`

`DB_PORT`

`DB_USERo`

`DB_PASS`

`DB_NAME`


## 👨‍💻 Autor

**Gustavo Cescon**  
Desenvolvedor Fullstack JavaScript apaixonado por tecnologia, com foco em criar soluções eficientes, escaláveis e bem estruturadas.

[![LinkedIn](https://img.shields.io/badge/LinkedIn-GustavoCescon-blue?logo=linkedin)](https://www.linkedin.com/in/gustavo-cescon/)

---


## 🤝 Licença

Este projeto está licenciado sob a **[MIT](https://choosealicense.com/licenses/mit/)**.  

Sinta-se livre para usar, estudar e modificar!
