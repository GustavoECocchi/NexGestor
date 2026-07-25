// Plasmo resolve imports de imagem (~assets/x.png) pra uma URL de string em
// build real. Nos testes não existe bundler de assets, então qualquer import
// desse tipo cai aqui — só precisa ser uma string, o valor não importa.
export default "test-file-stub.png"
