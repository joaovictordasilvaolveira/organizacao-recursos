package br.com.senac.recursos.material;

import java.util.Locale;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "material")
public class Material {

    @Id
    private UUID id;

    @Column(nullable = false, length = 30)
    private String codigo;

    @Column(nullable = false, length = 120)
    private String nome;

    @Column(nullable = false, length = 60)
    private String tipo;

    @Column(nullable = false)
    private int quantidade;

    /** Definido fora da API (V7); só leitura aqui. */
    @Column(name = "restrito", insertable = false, updatable = false)
    private boolean restrito;

    /** Alterado pelo ManutencaoController (RF-08, V9); só leitura aqui. */
    @Column(name = "em_manutencao", insertable = false, updatable = false)
    private boolean emManutencao;

    protected Material() {
    }

    Material(String codigo, String nome, String tipo, int quantidade) {
        this.id = UUID.randomUUID();
        this.codigo = codigo.trim().toUpperCase(Locale.ROOT);
        this.nome = nome.trim();
        this.tipo = tipo.trim();
        this.quantidade = quantidade;
    }

    public UUID getId() {
        return id;
    }

    public String getCodigo() {
        return codigo;
    }

    public String getNome() {
        return nome;
    }

    public String getTipo() {
        return tipo;
    }

    public int getQuantidade() {
        return quantidade;
    }

    public boolean isRestrito() {
        return restrito;
    }

    public boolean isEmManutencao() {
        return emManutencao;
    }
}
