package br.com.senac.recursos.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.httpBasic;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.UUID;

import com.jayway.jsonpath.JsonPath;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * RF-15 — o que a interface web precisa da API: páginas públicas com CSP,
 * 401 sem o desafio Basic do navegador, listagem de reservas por perfil e a
 * situação dos recursos no catálogo.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
class InterfaceWebIntegrationTest {

    private static final String SENHA = "senha-de-teste";

    @Container
    private static final PostgreSQLContainer<?> POSTGRES =
            new PostgreSQLContainer<>("postgres:17-alpine");

    @Autowired
    private MockMvc mvc;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private PasswordEncoder senhas;

    @DynamicPropertySource
    static void configurarBanco(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
    }

    // ---------- páginas e segurança do navegador ----------

    @ParameterizedTest(name = "{0} é público e protegido por CSP")
    @ValueSource(strings = {"/", "/index.html", "/app.js", "/app.css", "/favicon.svg"})
    void arquivosDaInterfaceSaoPublicosComCsp(String caminho) throws Exception {
        mvc.perform(get(caminho))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Security-Policy", containsString("script-src 'self'")))
                .andExpect(header().string("Content-Security-Policy", containsString("frame-ancestors 'none'")))
                .andExpect(header().string("X-Content-Type-Options", "nosniff"));
    }

    @Test
    void paginaInicialCarregaScriptExternoSemScriptInline() throws Exception {
        var html = mvc.perform(get("/index.html")).andReturn().getResponse().getContentAsString();

        assertThat(html).contains("<script src=\"app.js\" defer></script>");
        assertThat(html).doesNotContain("onclick=").doesNotContain("<script>").doesNotContain("style=");
    }

    @Test
    void dadosContinuamExigindoLoginMesmoComAInterfacePublica() throws Exception {
        mvc.perform(get("/api/v1/reservas")).andExpect(status().isUnauthorized());
        mvc.perform(post("/index.html")).andExpect(status().isUnauthorized());
    }

    @Test
    void chamadaDaInterfaceRecebe401SemDesafioBasicDoNavegador() throws Exception {
        mvc.perform(get("/api/v1/me").header("X-Requested-With", "XMLHttpRequest")
                        .with(httpBasic("ninguem@example.test", "errada")))
                .andExpect(status().isUnauthorized())
                .andExpect(header().doesNotExist("WWW-Authenticate"))
                .andExpect(jsonPath("$.detail").value("Credenciais ausentes ou inválidas."));
    }

    @Test
    void clienteDeApiContinuaRecebendoDesafioBasic() throws Exception {
        mvc.perform(get("/api/v1/me"))
                .andExpect(status().isUnauthorized())
                .andExpect(header().string("WWW-Authenticate", containsString("Basic")));
    }

    // ---------- listagem de reservas ----------

    @Test
    void solicitanteVeSomenteAsPropriasReservas() throws Exception {
        var ana = cadastrarUsuario("SOLICITANTE");
        var bruno = cadastrarUsuario("SOLICITANTE");
        var daAna = criarReserva(ana, cadastrarSala(false), null, null);
        var doBruno = criarReserva(bruno, cadastrarSala(false), null, null);

        var ids = idsListados(ana, "");

        assertThat(ids).contains(daAna.toString()).doesNotContain(doBruno.toString());
    }

    @ParameterizedTest(name = "{0} vê reservas de todos e filtra por situação")
    @ValueSource(strings = {"RESPONSAVEL", "ADMINISTRADOR"})
    void responsavelEAdministradorVeemTodasEFiltramPorEstado(String perfil) throws Exception {
        var solicitante = cadastrarUsuario("SOLICITANTE");
        var gestor = cadastrarUsuario(perfil);
        var pendente = criarReserva(solicitante, cadastrarSala(true), null, null);
        var aprovada = criarReserva(solicitante, cadastrarSala(false), null, null);

        assertThat(idsListados(gestor, "")).contains(pendente.toString(), aprovada.toString());
        assertThat(idsListados(gestor, "?estado=SOLICITADA"))
                .contains(pendente.toString()).doesNotContain(aprovada.toString());
    }

    @Test
    void reservaListadaTrazPeriodoSolicitanteERecursosComCodigo() throws Exception {
        var solicitante = cadastrarUsuario("SOLICITANTE");
        var sala = cadastrarSala(false);
        var professor = cadastrarProfessor();
        var material = cadastrarMaterial();
        var reserva = criarReserva(solicitante, sala, professor, material);

        mvc.perform(get("/api/v1/reservas").with(login(solicitante)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(reserva.toString()))
                .andExpect(jsonPath("$[0].solicitante").value("Usuário de teste"))
                .andExpect(jsonPath("$[0].estado").value("APROVADA"))
                .andExpect(jsonPath("$[0].inicio").value("2040-01-01T14:00:00Z"))
                .andExpect(jsonPath("$[0].recursos.length()").value(3))
                .andExpect(jsonPath("$[0].recursos[0].tipo").value("SALA"))
                .andExpect(jsonPath("$[0].recursos[0].codigo").value(codigo(sala)))
                .andExpect(jsonPath("$[0].recursos[?(@.tipo == 'PROFESSOR')].codigo").value(codigo(professor)))
                .andExpect(jsonPath("$[0].recursos[?(@.tipo == 'MATERIAL')].codigo").value(codigo(material)));
    }

    @Test
    void reservaCanceladaContinuaListadaComOsRecursos() throws Exception {
        var solicitante = cadastrarUsuario("SOLICITANTE");
        var reserva = criarReserva(solicitante, cadastrarSala(false), null, null);
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .delete("/api/v1/reservas/{id}", reserva).with(login(solicitante)))
                .andExpect(status().isNoContent());

        mvc.perform(get("/api/v1/reservas?estado=CANCELADA").with(login(solicitante)))
                .andExpect(jsonPath("$[0].id").value(reserva.toString()))
                .andExpect(jsonPath("$[0].recursos.length()").value(1));
    }

    @Test
    void situacaoInvalidaRetorna400() throws Exception {
        mvc.perform(get("/api/v1/reservas?estado=QUALQUER").with(login(cadastrarUsuario("RESPONSAVEL"))))
                .andExpect(status().isBadRequest());
    }

    // ---------- catálogo: situação do recurso ----------

    @Test
    void catalogoMostraRecursoRestritoEEmManutencao() throws Exception {
        var admin = cadastrarUsuario("ADMINISTRADOR");
        var sala = cadastrarSala(true);
        var material = cadastrarMaterial();

        mvc.perform(put("/api/v1/salas/{id}/manutencao", sala).with(login(admin))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"emManutencao\":true}"))
                .andExpect(status().isOk());
        mvc.perform(put("/api/v1/materiais/{id}/manutencao", material).with(login(admin))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"emManutencao\":true}"))
                .andExpect(status().isOk());

        mvc.perform(get("/api/v1/salas/{id}", sala).with(login(admin)))
                .andExpect(jsonPath("$.restrito").value(true))
                .andExpect(jsonPath("$.emManutencao").value(true));
        mvc.perform(get("/api/v1/materiais/{id}", material).with(login(admin)))
                .andExpect(jsonPath("$.restrito").value(false))
                .andExpect(jsonPath("$.emManutencao").value(true));
        mvc.perform(get("/api/v1/professores/{id}", cadastrarProfessor()).with(login(admin)))
                .andExpect(jsonPath("$.restrito").value(false));
    }

    @Test
    void cadastroPelaApiNasceSemRestricaoEForaDeManutencao() throws Exception {
        var admin = cadastrarUsuario("ADMINISTRADOR");
        var codigo = "W-" + UUID.randomUUID().toString().substring(0, 8);

        mvc.perform(post("/api/v1/salas").with(login(admin)).contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"codigo":"%s","tipo":"Aula","capacidade":30,"localizacao":"Bloco W"}
                                """.formatted(codigo)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.restrito").value(false))
                .andExpect(jsonPath("$.emManutencao").value(false));
    }

    // ---------- apoio ----------

    private List<String> idsListados(UUID usuario, String consulta) throws Exception {
        var corpo = mvc.perform(get("/api/v1/reservas" + consulta).with(login(usuario)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return JsonPath.read(corpo, "$[*].id");
    }

    private UUID criarReserva(UUID solicitante, UUID sala, UUID professor, UUID material) throws Exception {
        var extras = new StringBuilder();
        if (professor != null) {
            extras.append(",\"professorId\":\"").append(professor).append('"');
        }
        if (material != null) {
            extras.append(",\"materialIds\":[\"").append(material).append("\"]");
        }
        var corpo = mvc.perform(post("/api/v1/reservas").with(login(solicitante))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"salaId":"%s","inicio":"2040-01-01T14:00:00Z","fim":"2040-01-01T16:00:00Z"%s}
                                """.formatted(sala, extras)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return UUID.fromString(JsonPath.read(corpo, "$.id"));
    }

    private UUID cadastrarSala(boolean restrita) {
        var sala = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO sala (id, codigo, tipo, capacidade, localizacao, restrito)
                VALUES (?, ?, 'Sala de aula', 20, 'Bloco A', ?)
                """, sala, codigo(sala), restrita);
        return sala;
    }

    private UUID cadastrarProfessor() {
        var professor = UUID.randomUUID();
        jdbc.update("INSERT INTO professor (id, codigo, nome, competencia) VALUES (?, ?, 'Ana', 'Java')",
                professor, codigo(professor));
        return professor;
    }

    private UUID cadastrarMaterial() {
        var material = UUID.randomUUID();
        jdbc.update("INSERT INTO material (id, codigo, nome, tipo, quantidade) VALUES (?, ?, 'Projetor', 'audiovisual', 1)",
                material, codigo(material));
        return material;
    }

    private static String codigo(UUID id) {
        return id.toString().substring(0, 20).toUpperCase();
    }

    private UUID cadastrarUsuario(String perfil) {
        var id = UUID.randomUUID();
        jdbc.update("""
                INSERT INTO app_user (id, name, email, role, password_hash)
                VALUES (?, 'Usuário de teste', ?, ?, ?)
                """, id, id + "@example.test", perfil, senhas.encode(SENHA));
        return id;
    }

    private static RequestPostProcessor login(UUID usuario) {
        return httpBasic(usuario + "@example.test", SENHA);
    }
}
